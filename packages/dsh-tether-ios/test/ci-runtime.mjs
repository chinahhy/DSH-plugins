// CI-only: actual version-pinned Cordis, WebServer and Connection packages.
// No DSH application, user profile, account or model credentials are loaded.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import * as tether from '../lib/index.js'
if (process.env.CI !== 'true') throw new Error('Official API integration runs only in CI')
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(root + 'tmp/api/package.json')
const load = name => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: WebServer } = await load('@deepseek-ai/dsh-host-webserver')
const Connection = await load('@deepseek-ai/dsh-client-connection')
for (const name of ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-connection']) {
  assert.equal(require(name + '/package.json').version, '0.2.0-rc.2')
}
await mkdir(root + 'tmp', { recursive: true })
const home = await mkdtemp(root + 'tmp/ci-home-')
const ctx = new Context()
const records = new Map()
ctx.provide('credentials', { async modifyRecord(key, update) {
  const value = await update(records.get(key))
  if (value) records.set(key, value)
  return records.get(key)
} })
ctx.provide('dshHomePath', (...segments) => join(home, ...segments))
try {
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(Connection)
  const server = ctx.get('webServer'); const connection = ctx.get('connection')
  assert.ok(server.port > 0); assert.equal(typeof connection.requestRejection, 'function')
  const authority = `127.0.0.1:${server.port}`
  // The fixture replaces only static index content, while using real DSH authorization.
  const untap = server.registerFallback((req, res) => {
    if (!connection.authorizeIndex(req, res)) return
    res.writeHead(200); res.end('synthetic DSH index')
  })
  const auth = await tether.exchangeAuthentication(connection, authority)
  const headers = { cookie: auth.cookie, 'x-dsh-tether-control': '1' }
  const plugin = await ctx.plugin(tether)
  const url = `http://${authority}/dsh-tether/`
  assert.equal((await fetch(url + 'devices', { headers: { 'x-dsh-tether-control': '1' } })).status, 401)
  assert.equal((await fetch(url + 'pairing', { headers })).status, 405)
  assert.equal((await fetch(url + 'pairing', { method: 'POST', headers: { ...headers, 'x-dsh-tether-remote': '1' } })).status, 403)
  assert.equal((await (await fetch(url + 'relay', { headers })).json()).mode, 'public')
  const remoteState = await fetch(url + 'relay', { headers: { ...headers, 'x-dsh-tether-remote': '1' } })
  assert.equal(remoteState.status, 200)
  assert.deepEqual(await remoteState.json(), { mode: 'public', privateAvailable: false, switching: false, ready: true, canSwitch: false })
  assert.equal((await fetch(url + 'relay', { method: 'POST', headers: { ...headers, 'x-dsh-tether-remote': '1' }, body: JSON.stringify({ mode: 'private' }) })).status, 403)
  assert.equal((await fetch(url + 'relay', { method: 'POST', headers, body: JSON.stringify({ mode: 'private' }) })).status, 503)
  assert.equal((await (await fetch(url + 'relay', { method: 'POST', headers, body: JSON.stringify({ mode: 'public' }) })).json()).ready, true)
  const paired = await fetch(url + 'pairing', { method: 'POST', headers })
  assert.equal(paired.status, 200)
  assert.match((await paired.json()).pairingString, /^[a-f0-9]{64}#[0-9]{6}$/)
  assert.deepEqual((await (await fetch(url + 'devices', { headers })).json()).devices, [])
  const keyPath = join(home, 'data/dsh-tether-ios/identity.key')
  assert.equal((await readFile(keyPath)).length, 32)
  await plugin.dispose()
  // A disposed route falls through to the synthetic authenticated index.
  assert.equal(await (await fetch(url + 'devices', { headers })).text(), 'synthetic DSH index')
  untap()
  console.log('PASS: exact DSH 0.2.0-rc.2 services, auth, plugin activation, routes, data scope and disposal')
} finally { await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true }) }

// Parent pipe loss must terminate the real native binary without a signal.
const orphanHome = await mkdtemp(root + 'tmp/ci-eof-')
try {
  const child = spawn(root + 'bin/darwin-arm64/tether-host', ['host', '--data-dir', orphanHome, '--lang', 'en'], { stdio: ['pipe', 'pipe', 'ignore'] })
  const closed = once(child, 'close')
  const lines = createInterface({ input: child.stdout })
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
  for await (const line of lines) { if (JSON.parse(line).type === 'ready') { child.stdin.end(); break } }
  const [code, signal] = await closed
  clearTimeout(timer); assert.equal(code, 0); assert.equal(signal, null)
  console.log('PASS: actual sidecar exits on parent stdin EOF')
} finally { await rm(orphanHome, { recursive: true, force: true }) }
