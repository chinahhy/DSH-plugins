import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Readable } from 'node:stream'
import { RelayController, readRelayConfig, saveRelayConfig, relayArguments } from '../src/relay.js'
import { registerRoutes } from '../src/routes.js'

const config = { version: 1, mode: 'public', additionalRelayUrls: ['https://relay.example.test/'] }
function fixture(overrides = {}) {
  let live = 0, peak = 0
  const events = [], children = []
  const owner = new RelayController(config, {
    start: async c => {
      live++; peak = Math.max(peak, live); events.push('start:' + c.mode)
      const child = { endpointId: 'a'.repeat(64), failure: undefined, stopped: false,
        send: m => { events.push(m.type + ':' + (m.id ?? '')); return true },
        request: async () => ({ devices: [] }),
        stop: async () => { if (!child.stopped) { child.stopped = true; live--; events.push('stop') } } }
      children.push(child); return child
    },
    persist: async next => events.push('save:' + next.mode),
    probe: async () => {},
    ...overrides,
  })
  return { owner, events, children, counts: () => ({ live, peak }) }
}
test('switch is exclusive, persists after startup, preserves identity and replays active approvals', async () => {
  const f = fixture(); await f.owner.initialize()
  f.owner.send({ type: 'approval', id: 'pending', tool_name: 'synthetic' })
  assert.equal((await f.owner.switchMode('private')).mode, 'private')
  assert.deepEqual(f.counts(), { live: 1, peak: 1 })
  assert.deepEqual(f.events.slice(-4), ['stop', 'start:private', 'save:private', 'approval:pending'])
  f.owner.send({ type: 'approval-cancel', id: 'pending' })
  await f.owner.switchMode('public')
  assert.equal(f.owner.state().ready, true)
  await f.owner.stop(); assert.equal(f.counts().live, 0)
})
test('failed private reachability leaves old process and selection untouched', async () => {
  const f = fixture({ probe: async () => { throw new Error('offline') } }); await f.owner.initialize()
  await assert.rejects(f.owner.switchMode('private'), /offline/)
  assert.equal(f.children.length, 1); assert.equal(f.owner.state().mode, 'public'); assert.equal(f.owner.state().switching, false)
  await f.owner.stop()
})
test('persistence failure shuts down candidate and restores previous child', async () => {
  const f = fixture({ persist: async () => { throw new Error('read-only') } }); await f.owner.initialize()
  await assert.rejects(f.owner.switchMode('private'), /read-only/)
  assert.equal(f.owner.state().mode, 'public'); assert.equal(f.owner.state().ready, true)
  assert.deepEqual(f.counts(), { live: 1, peak: 1 }); assert.equal(f.children.length, 3)
  await f.owner.stop()
})
test('rapid clicks are serialized and disposal during a probe leaves no replacement child', async () => {
  let unblock
  const f = fixture({ probe: () => new Promise(resolve => { unblock = resolve }) }); await f.owner.initialize()
  const switching = f.owner.switchMode('private')
  await assert.rejects(f.owner.switchMode('private'), /switching/)
  const stopped = f.owner.stop(); unblock()
  await assert.rejects(switching, /stopped/); await stopped
  assert.equal(f.counts().live, 0); assert.equal(f.children.length, 1)
})
test('selection is atomic, private, reloadable, and rejects concurrent file edits', async () => {
  const base = resolve('tmp/tests'); await mkdir(base, { recursive: true })
  const dir = await mkdtemp(join(base, 'relay-mode-'))
  try {
    const empty = await readRelayConfig(dir)
    assert.equal(empty.mode, 'public'); assert.deepEqual(relayArguments(empty), [])
    await saveRelayConfig(dir, config, empty)
    const next = { ...config, mode: 'private' }
    await saveRelayConfig(dir, next, config)
    assert.deepEqual(await readRelayConfig(dir), next)
    assert.equal((await stat(join(dir, 'relay.json'))).mode & 0o777, 0o600)
    assert.deepEqual(relayArguments(next), ['--private-relay-only', '--additional-relay', 'https://relay.example.test/'])
    await assert.rejects(saveRelayConfig(dir, config, config), /concurrently/)
    assert.equal(JSON.parse(await readFile(join(dir, 'relay.json'))).mode, 'private')
    await writeFile(join(dir, 'relay.json'), JSON.stringify({ ...config, mode: 'invalid' }))
    await assert.rejects(readRelayConfig(dir), /mode/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('relay mutation is local/authenticated, bounded, and cannot inject a URL', async () => {
  const f = fixture(); await f.owner.initialize()
  const routes = new Map()
  const dispose = registerRoutes({ port: 1234, register: r => { routes.set(r.path, r.handler); return () => routes.delete(r.path) } }, { requestRejection: r => r.headers.cookie === 'fixture' ? undefined : 401 }, f.owner)
  async function call(body, overrides = {}, method = 'POST') {
    const req = Object.assign(Readable.from([Buffer.from(body)]), { method,
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:1234', cookie: 'fixture', 'x-dsh-tether-control': '1', ...overrides } })
    const res = { writeHead(s) { this.status = s }, end(b) { this.body = JSON.parse(b) } }
    await routes.get('/dsh-tether/relay')(req, res); return res
  }
  assert.equal((await call('{"mode":"private"}', { cookie: '' })).status, 401)
  assert.equal((await call('{"mode":"private"}', { 'x-dsh-tether-remote': '1' })).status, 403)
  assert.equal((await call('{"mode":"private"}', { origin: 'https://evil.test' })).status, 403)
  assert.equal((await call('{"mode":"private","url":"https://evil.test"}')).status, 400)
  assert.equal((await call('x'.repeat(1025))).status, 400)
  assert.equal((await call('{"mode":"private"}')).body.mode, 'private')
  assert.equal((await call('', {}, 'GET')).body.mode, 'private')
  assert.equal((await call('', {}, 'GET')).body.canSwitch, true)
  const remote = await call('', { 'x-dsh-tether-remote': '1' }, 'GET')
  assert.equal(remote.status, 200)
  assert.deepEqual(remote.body, { mode: 'private', privateAvailable: true, switching: false, ready: true, canSwitch: false })
  assert.equal((await call('', { 'x-dsh-tether-remote': '1', cookie: '' }, 'GET')).status, 401)
  assert.equal((await call('', { 'x-dsh-tether-remote': '1', origin: 'https://evil.test' }, 'GET')).status, 403)
  assert.equal((await call('', { 'x-dsh-tether-remote': '1', 'sec-fetch-site': 'cross-site' }, 'GET')).status, 403)
  assert.equal((await call('', { 'x-dsh-tether-remote': '1', 'x-dsh-tether-control': undefined }, 'GET')).status, 403)
  dispose(); await f.owner.stop()
})
