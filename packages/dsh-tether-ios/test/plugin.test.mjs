import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { assertPlatform, dataDirectory, additionalRelayArguments, exchangeAuthentication, observeApprovals } from '../src/index.js'
import { Sidecar } from '../src/sidecar.js'
import { rejection, registerRoutes } from '../src/routes.js'

const id = 'a'.repeat(64)
const server = { port: 1234 }
const authenticated = { requestRejection: () => undefined }
const request = (headers = {}, method = 'GET', body = '') => Object.assign(Readable.from([Buffer.from(body)]), {
  headers: { host: '127.0.0.1:1234', 'x-dsh-tether-control': '1', ...headers }, method,
  socket: { remoteAddress: '127.0.0.1' },
})
test('only macOS arm64 is admitted', () => {
  assertPlatform('darwin', 'arm64')
  for (const [os, arch] of [['darwin', 'x64'], ['linux', 'arm64'], ['win32', 'arm64']]) assert.throws(() => assertPlatform(os, arch))
})
test('data is inside the DSH-owned root; symlink escapes fail closed', async () => {
  const base = resolve('tmp/tests'); await mkdir(base, { recursive: true })
  const home = await mkdtemp(join(base, 'home-'))
  try {
    assert.equal(await dataDirectory(() => home), join(home, 'data/dsh-tether-ios'))
    assert.deepEqual(await readdir(home), ['data'])
    await rm(join(home, 'data/dsh-tether-ios'), { recursive: true })
    await symlink(base, join(home, 'data/dsh-tether-ios'))
    await assert.rejects(dataDirectory(() => home), /real directory/)
    await assert.rejects(dataDirectory(() => '.'), /absolute/)
  } finally { await rm(home, { recursive: true, force: true }) }
})
test('auth exchange stays in memory and checks the exact redirect contract', async () => {
  const connection = { authenticatedUrl: url => url + '?synthetic=fixture' }
  const result = await exchangeAuthentication(connection, '127.0.0.1:1234', async (url, options) => {
    assert.equal(options.redirect, 'manual')
    assert.equal(url, 'http://127.0.0.1:1234/?synthetic=fixture')
    return new Response(null, { status: 303, headers: { 'set-cookie': 'fixture=only; HttpOnly' } })
  })
  assert.deepEqual(result, { type: 'proxy-auth', cookie: 'fixture=only', authority: '127.0.0.1:1234' })
  await assert.rejects(exchangeAuthentication(connection, '127.0.0.1:1234', async () => new Response('no')), /unavailable/)
})
test('browser auth required; cross-site, remote-peer, and tunnel management denied', () => {
  assert.equal(rejection(request(), server, authenticated), undefined)
  assert.equal(rejection(request(), server, { requestRejection: () => 401 }), 401)
  for (const headers of [
    { host: 'evil.test:1234' }, { host: '127.0.0.1:5678' }, { origin: 'http://evil.test' },
    { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }, { 'x-dsh-tether-remote': '1' },
  ]) assert.equal(rejection(request(headers), server, authenticated), 403)
  assert.equal(rejection(request({ origin: 'http://127.0.0.1:1234' }), server, authenticated), undefined)
  const req = request(); req.socket.remoteAddress = '10.0.0.2'
  assert.equal(rejection(req, server, authenticated), 403)
})
test('routes require POST for pairing and reject missing markers, invalid IDs, and preflights', async () => {
  const routes = new Map(); const calls = []
  const sidecar = { endpointId: id, request: async (command) => { calls.push(command); return { code: '012345', expires_in_sec: 600, devices: [] } } }
  const stop = registerRoutes({ ...server, register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }, authenticated, sidecar)
  const call = async (path, req) => {
    const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
    await routes.get('/dsh-tether/' + path)(req, res); return res
  }
  assert.equal((await call('pairing', request())).status, 405)
  assert.equal((await call('pairing', request({}, 'OPTIONS'))).status, 405)
  assert.equal((await call('pairing', request({ 'x-dsh-tether-control': undefined }, 'POST'))).status, 403)
  assert.equal((await call('pairing', request({ 'x-dsh-tether-remote': '1' }, 'POST'))).status, 403)
  assert.equal((await call('devices', request({ 'x-dsh-tether-remote': '1' }))).status, 403)
  const paired = await call('pairing', request({}, 'POST'))
  assert.equal(paired.body.pairingString, id + '#012345')
  assert.equal(paired.body.mobilePairingString, id + '#012345')
  assert.equal((await call('devices', request({}, 'POST', JSON.stringify({ id: '../bad' })))).status, 400)
  assert.equal((await call('devices', request({}, 'POST', 'x'.repeat(1025)))).status, 400)
  assert.equal((await call('devices', request({}, 'POST', JSON.stringify({ id })))).status, 200)
  assert.deepEqual(calls, [{ type: 'pairing-begin' }, { type: 'device-forget', id }])
  stop(); assert.equal(routes.size, 0)
})
test('native pairing ticket carries only the active private relay URLs on the local route', async () => {
  const routes = new Map()
  const sidecar = { endpointId: id, config: { mode: 'private', additionalRelayUrls: ['https://relay.example.test:6270/'] },
    request: async () => ({ code: '123456', expires_in_sec: 600 }) }
  const stop = registerRoutes({ ...server, register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path) } }, authenticated, sidecar)
  const call = async req => {
    const res = { writeHead(status) { this.status = status }, end(body) { this.body = JSON.parse(body) } }
    await routes.get('/dsh-tether/pairing')(req, res); return res
  }
  try {
    const denied = await call(request({ 'x-dsh-tether-remote': '1' }, 'POST'))
    assert.equal(denied.status, 403)
    const result = await call(request({}, 'POST'))
    assert.equal(result.body.pairingString, `${id}#123456`)
    assert.equal(result.body.mobilePairingString, `${id}#123456#https://relay.example.test:6270/`)
  } finally { stop() }
})
test('approval observer delegates once, including missing callId and downstream failure', async () => {
  let listener; const sent = []
  observeApprovals({ on: (event, callback, options) => { assert.equal(event, 'approval/request'); assert.equal(options.prepend, true); listener = callback } }, { send: message => sent.push(message) })
  let nextCalls = 0
  assert.equal(await listener({ toolName: 'fixture' }, async () => { nextCalls++; return 'rejected' }), 'rejected')
  assert.equal(nextCalls, 1)
  assert.equal(sent[0].id, sent[1].id)
  assert.equal(typeof sent[0].id, 'string')
  await assert.rejects(listener({ callId: 'fixture-call' }, async () => { throw new Error('fixture') }))
  assert.deepEqual(sent.at(-1), { type: 'approval-cancel', id: 'fixture-call' })
})
function fakeChild() {
  const child = new EventEmitter()
  child.stdin = new PassThrough(); child.stdout = new PassThrough()
  child.signals = []; child.kill = signal => { child.signals.push(signal); queueMicrotask(() => child.emit('close')); return true }
  return child
}
test('sidecar registers waiter before writing; concurrent requests remain correlated', async () => {
  const child = fakeChild(); const sent = []
  const sidecar = new Sidecar('fixture', [], { spawnChild: () => child })
  child.stdout.write(JSON.stringify({ type: 'ready', endpoint_id: id }) + '\n')
  child.stdin.on('data', data => {
    const msg = JSON.parse(data); sent.push(msg.type)
    child.stdout.write(JSON.stringify(msg.type === 'pairing-begin' ? { type: 'pairing', code: '123456' } : { type: 'devices', devices: [] }) + '\n')
  })
  const results = await Promise.all([sidecar.request({ type: 'pairing-begin' }, 'pairing'), sidecar.request({ type: 'device-list' }, 'devices')])
  assert.equal(results[0].code, '123456'); assert.deepEqual(results[1].devices, [])
  assert.deepEqual(sent, ['pairing-begin', 'device-list'])
  await sidecar.stop(); assert.deepEqual(child.signals, ['SIGTERM'])
})
test('request timeout prevents late-response reuse and stops child', async () => {
  const child = fakeChild(); const sidecar = new Sidecar('fixture', [], { spawnChild: () => child, timeoutMs: 20 })
  child.stdout.write(JSON.stringify({ type: 'ready', endpoint_id: id }) + '\n')
  await assert.rejects(sidecar.request({ type: 'pairing-begin' }, 'pairing'), /timed out/)
  await assert.rejects(sidecar.request({ type: 'pairing-begin' }, 'pairing'), /timed out/)
  await sidecar.stop()
})
test('unexpected child exit rejects in-flight callers without logging responses', async () => {
  const child = fakeChild(); const sidecar = new Sidecar('fixture', [], { spawnChild: () => child })
  child.stdout.write(JSON.stringify({ type: 'ready', endpoint_id: id }) + '\n')
  const pending = sidecar.request({ type: 'device-list' }, 'devices')
  await new Promise(resolve => setImmediate(resolve)); child.emit('close')
  await assert.rejects(pending, /stopped/)
})

test('optional relay configuration keeps default behavior and rejects credential URLs or symlinks', async () => {
  const base = resolve('tmp/tests'); await mkdir(base, { recursive: true })
  const dir = await mkdtemp(join(base, 'relay-'))
  const file = join(dir, 'relay.json')
  const put = value => writeFile(file, JSON.stringify(value))
  try {
    assert.deepEqual(await additionalRelayArguments(dir), [])
    await put({ version: 1, additionalRelayUrls: ['https://relay.example.test:6270', 'https://relay.example.test:6270/'] })
    assert.deepEqual(await additionalRelayArguments(dir), ['--private-relay-only', '--additional-relay', 'https://relay.example.test:6270/'])
    for (const url of ['http://relay.example.test', 'https://user:secret@relay.example.test', 'https://relay.example.test/?token=secret', 'https://relay.example.test/path', 'https://relay.example.test/#secret']) {
      await put({ version: 1, additionalRelayUrls: [url] })
      await assert.rejects(additionalRelayArguments(dir))
    }
    await put({ version: 2, additionalRelayUrls: [] })
    await assert.rejects(additionalRelayArguments(dir))
    await rm(file); await symlink(join(dir, 'missing'), file)
    await assert.rejects(additionalRelayArguments(dir), /configuration file/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
