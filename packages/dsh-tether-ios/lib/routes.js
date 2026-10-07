export const PREFIX = '/dsh-tether'
export const CONTROL_HEADER = 'x-dsh-tether-control'

/** Exact authority plus DSH's own browser authentication; Desktop strips Origin. */
export function rejection(req, server, connection, allowRemoteRead = false) {
  const hosts = [`127.0.0.1:${server.port}`, `localhost:${server.port}`]
  if (!hosts.includes(req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') return 403
  const address = req.socket?.remoteAddress
  if (address && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return 403
  if (req.headers.origin !== undefined) {
    try {
      const origin = new URL(req.headers.origin)
      if (origin.origin !== `http://${req.headers.host}`) return 403
    } catch { return 403 }
  }
  // The Rust proxy always overwrites this header. Only the local Desktop manages pairing.
  if (req.headers['x-dsh-tether-remote'] !== undefined && !allowRemoteRead) return 403
  return connection.requestRejection(req)
}
function reply(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}
async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024) throw new Error('Invalid device ID')
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
async function deviceId(req) {
  const { id } = await readBody(req)
  if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id)) throw new Error('Invalid device ID')
  return id
}
export function registerRoutes(server, connection, sidecar) {
  const registrations = []
  const add = (suffix, methods, handler) => registrations.push(server.register({
    kind: 'exact', path: PREFIX + suffix,
    handler: async (req, res) => {
      // A paired phone can see this non-sensitive state; all management stays local.
      const remoteRead = suffix === '/relay' && req.method === 'GET'
      const denied = rejection(req, server, connection, remoteRead)
      if (denied) return reply(res, denied, { error: 'Access denied' })
      if (!methods.includes(req.method)) return reply(res, 405, { error: 'Method not allowed' })
      if (req.headers[CONTROL_HEADER] !== '1') return reply(res, 403, { error: 'Access denied' })
      try { await handler(req, res) } catch { reply(res, 503, { error: 'Remote connection unavailable; reload the plugin to retry' }) }
    },
  }))
  try {
    add('/pairing', ['POST'], async (_req, res) => {
      const msg = await sidecar.request({ type: 'pairing-begin' }, 'pairing')
      if (!/^[0-9]{6}$/.test(msg.code) || !/^[a-f0-9]{64}$/.test(sidecar.endpointId)) throw new Error('Invalid pairing response')
      reply(res, 200, { pairingString: `${sidecar.endpointId}#${msg.code}`, expiresInSec: msg.expires_in_sec })
    })
    add('/devices', ['GET', 'POST'], async (req, res) => {
      let command = { type: 'device-list' }
      if (req.method === 'POST') {
        let id
        try { id = await deviceId(req) } catch { return reply(res, 400, { error: 'Invalid device ID' }) }
        command = { type: 'device-forget', id }
      }
      const msg = await sidecar.request(command, 'devices')
      reply(res, 200, { devices: msg.devices })
    })
    add('/relay', ['GET', 'POST'], async (req, res) => {
      if (req.method === 'POST') {
        let value
        try { value = await readBody(req) } catch { return reply(res, 400, { error: 'Invalid relay mode' }) }
        if (!value || !['public', 'private'].includes(value.mode) || Object.keys(value).length !== 1) return reply(res, 400, { error: 'Invalid relay mode' })
        if (sidecar.state().switching) return reply(res, 409, { error: 'Relay switching' })
        try { return reply(res, 200, await sidecar.switchMode(value.mode)) }
        catch { return reply(res, 503, { error: 'Relay switch failed', state: sidecar.state() }) }
      }
      reply(res, 200, { ...sidecar.state(), canSwitch: req.headers['x-dsh-tether-remote'] === undefined })
    })
    add('/status', ['GET'], async (_req, res) => reply(res, 200, { ready: !sidecar.failure && Boolean(sidecar.endpointId) }))
    return () => registrations.reverse().forEach(dispose => dispose())
  } catch (error) { registrations.reverse().forEach(dispose => dispose()); throw error }
}
