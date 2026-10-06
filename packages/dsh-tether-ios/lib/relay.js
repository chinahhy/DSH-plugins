import { readFile, lstat, writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function readRelayConfig(directory) {
  const path = join(directory, 'relay.json')
  let info
  try { info = await lstat(path) } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, mode: 'public', additionalRelayUrls: [] }
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw new Error('Invalid relay configuration file')
  const config = JSON.parse(await readFile(path, 'utf8'))
  if (config.version !== 1 || !Array.isArray(config.additionalRelayUrls) || config.additionalRelayUrls.length > 4) throw new Error('Invalid relay configuration')
  const urls = config.additionalRelayUrls.map(value => {
    if (typeof value !== 'string') throw new Error('Invalid relay URL')
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Relay requires a plain HTTPS origin')
    return url.href
  })
  const mode = config.mode ?? (urls.length ? 'private' : 'public')
  if (!['public', 'private'].includes(mode) || (mode === 'private' && !urls.length)) throw new Error('Invalid relay mode')
  return { version: 1, mode, additionalRelayUrls: [...new Set(urls)] }
}
export function relayArguments(config) {
  return config.mode === 'public' ? [] : ['--private-relay-only', ...config.additionalRelayUrls.flatMap(url => ['--additional-relay', url])]
}
export async function saveRelayConfig(directory, config, previous) {
  if (JSON.stringify(await readRelayConfig(directory)) !== JSON.stringify(previous)) throw new Error('Relay configuration changed concurrently')
  const temp = join(directory, 'relay-' + randomUUID() + '.tmp')
  try {
    await writeFile(temp, JSON.stringify(config) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temp, join(directory, 'relay.json'))
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}
export async function checkPrivateRelay(config, signal) {
  // Only configured origins can be checked; the control API never accepts a URL.
  const results = await Promise.allSettled(config.additionalRelayUrls.map(async url => {
    const response = await fetch(new URL('healthz', url), { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) })
    try {
      if (!response.ok) throw new Error('Relay unavailable')
      const body = await response.json()
      if (body.status !== 'ok') throw new Error('Relay unavailable')
    } finally { await response.body?.cancel().catch(() => {}) }
  }))
  if (!results.some(result => result.status === 'fulfilled')) throw new Error('Private relay unavailable')
}

/** One owner, one child. Selection commits only after authenticated startup. */
export class RelayController {
  constructor(config, { start, persist, probe = checkPrivateRelay }) {
    this.config = config
    this.startChild = start
    this.persist = persist
    this.probe = probe
    this.busy = false
    this.disposed = false
    this.abort = new AbortController()
    this.approvals = new Map()
  }
  get endpointId() { return this.current?.endpointId ?? '' }
  get failure() { return this.current?.failure ?? (!this.current ? new Error('Sidecar unavailable') : undefined) }
  state() {
    return { mode: this.config.mode, privateAvailable: this.config.additionalRelayUrls.length > 0,
      switching: this.busy, ready: !this.disposed && !this.failure && Boolean(this.endpointId) }
  }
  async initialize() {
    this.operation = (async () => {
      this.current = await this.startChild(this.config)
      if (this.disposed) { await this.current.stop(); throw new Error('Plugin stopped') }
    })()
    await this.operation
    return this
  }
  send(message) {
    if (message.type === 'approval') this.approvals.set(message.id, message)
    if (message.type === 'approval-cancel') this.approvals.delete(message.id)
    return this.current?.send(message) ?? false
  }
  request(...args) {
    if (this.busy || this.disposed || !this.current) return Promise.reject(new Error('Relay switching'))
    return this.current.request(...args)
  }
  switchMode(mode) {
    if (!['public', 'private'].includes(mode)) return Promise.reject(new Error('Invalid relay mode'))
    if (this.disposed || this.busy) return Promise.reject(new Error('Relay switching'))
    if (mode === 'private' && !this.config.additionalRelayUrls.length) return Promise.reject(new Error('Private relay not configured'))
    if (mode === this.config.mode && !this.failure) return Promise.resolve(this.state())
    this.busy = true
    this.operation = this.performSwitch(mode).finally(() => { this.busy = false })
    return this.operation.then(() => this.state())
  }
  async performSwitch(mode) {
    const previous = this.config
    const next = { ...previous, mode }
    // A failed health check leaves the running child and saved selection untouched.
    if (mode === 'private') await this.probe(next, this.abort.signal)
    if (this.disposed) throw new Error('Plugin stopped')
    const identity = this.endpointId
    await this.current?.stop()
    this.current = undefined
    let candidate
    try {
      candidate = await this.startChild(next)
      if (this.disposed) throw new Error('Plugin stopped')
      if (identity && candidate.endpointId !== identity) throw new Error('Host identity changed')
      await this.persist(next, previous)
      this.config = next
      this.current = candidate
      for (const message of this.approvals.values()) this.current.send(message)
    } catch (error) {
      await candidate?.stop()
      if (!this.disposed) {
        try {
          this.current = await this.startChild(previous)
          for (const message of this.approvals.values()) this.current.send(message)
        } catch { this.current = undefined }
      }
      throw error
    }
  }
  async stop() {
    this.disposed = true
    this.abort.abort()
    await this.operation?.catch(() => {})
    await this.current?.stop()
    this.approvals.clear()
  }
}
