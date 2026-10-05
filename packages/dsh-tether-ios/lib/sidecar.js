import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

/** One serialized request at a time: the upstream stdio protocol has no request IDs. */
export class Sidecar {
  constructor(binary, args, { spawnChild = spawn, timeoutMs = 5000, stopMs = 2000 } = {}) {
    this.endpointId = ''
    this.timeoutMs = timeoutMs
    this.stopMs = stopMs
    this.failure = undefined
    this.tail = Promise.resolve()
    this.child = spawnChild(binary, args, { stdio: ['pipe', 'pipe', 'ignore'], detached: false })
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject })
    // The owner can await ready later without an unhandled rejection during spawn failure.
    this.ready.catch(() => {})
    this.readyTimer = setTimeout(() => this.fail('Sidecar startup timed out'), timeoutMs)
    this.lines = createInterface({ input: this.child.stdout })
    this.lines.on('line', line => {
      if (line.length > 256 * 1024) { this.fail('Invalid sidecar response'); return }
      let message
      try { message = JSON.parse(line) } catch { this.fail('Invalid sidecar response'); return }
      if (message.type === 'ready' && /^[a-f0-9]{64}$/.test(message.endpoint_id)) {
        this.endpointId = message.endpoint_id
        clearTimeout(this.readyTimer)
        this.readyResolve()
      }
      if (this.pending?.type === message.type) {
        const { resolve, timer } = this.pending
        this.pending = undefined
        clearTimeout(timer)
        resolve(message)
      }
    })
    this.child.once('error', () => this.fail('Sidecar could not start'))
    this.child.stdin.on('error', () => this.fail('Sidecar input closed'))
    this.closed = new Promise(resolve => this.child.once('close', () => {
      this.hasClosed = true
      this.fail('Sidecar stopped')
      clearTimeout(this.killTimer)
      this.lines.close()
      resolve()
    }))
  }
  fail(message) {
    this.failure ??= new Error(message)
    clearTimeout(this.readyTimer)
    this.readyReject(this.failure)
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(this.failure)
      this.pending = undefined
    }
  }
  send(message) {
    if (this.failure || this.child.stdin.destroyed) return false
    try { this.child.stdin.write(JSON.stringify(message) + '\n'); return true } catch { return false }
  }
  request(command, responseType) {
    const result = this.tail.then(async () => {
      await this.ready
      if (this.failure) throw this.failure
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          // A late reply cannot be safely correlated. End this instance instead of
          // accidentally satisfying a later pairing/revocation request with it.
          this.fail('Sidecar request timed out')
          void this.stop()
        }, this.timeoutMs)
        this.pending = { type: responseType, resolve, reject, timer }
        if (!this.send(command)) this.fail('Sidecar input closed')
      })
    })
    this.tail = result.catch(() => {})
    return result
  }
  async stop() {
    if (this.stopping || this.hasClosed) return this.closed
    this.stopping = true
    this.fail('Plugin stopped')
    // EOF is the normal shutdown; SIGTERM and then SIGKILL bound stuck cleanup.
    this.child.stdin.end()
    this.child.kill('SIGTERM')
    this.killTimer = setTimeout(() => this.child.kill('SIGKILL'), this.stopMs)
    this.killTimer.unref?.()
    return this.closed
  }
}
