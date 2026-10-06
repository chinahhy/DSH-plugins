import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, lstat, access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, isAbsolute, relative, sep } from 'node:path'
import { Sidecar } from './sidecar.js'
import { registerRoutes } from './routes.js'

export const name = 'dsh-tether-ios'
export const inject = ['webServer', 'connection', 'dshHomePath']

export function assertPlatform(platform = process.platform, arch = process.arch) {
  if (platform !== 'darwin' || arch !== 'arm64') throw new Error('dsh-tether-ios requires macOS Apple Silicon')
}
/** Resolve from the owning DSH Context; never infer the home from cwd or HOME. */
export async function dataDirectory(resolveHome) {
  if (typeof resolveHome !== 'function') throw new Error('DSH home resolver unavailable')
  const home = resolveHome()
  if (!isAbsolute(home)) throw new Error('DSH home must be absolute')
  const canonical = await realpath(home)
  let directory = canonical
  for (const part of ['data', 'dsh-tether-ios']) {
    directory = join(directory, part)
    try { await mkdir(directory, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Plugin data path must be a real directory')
    const resolved = await realpath(directory)
    if (relative(canonical, resolved).startsWith('..' + sep)) throw new Error('Plugin data path escapes DSH home')
  }
  return directory
}

/** Optional user-owned data configuration. Public relays remain enabled. */
export async function additionalRelayArguments(directory) {
  const path = join(directory, 'relay.json')
  let info
  try { info = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw new Error('Invalid relay configuration file')
  const config = JSON.parse(await readFile(path, 'utf8'))
  if (config.version !== 1 || !Array.isArray(config.additionalRelayUrls) || config.additionalRelayUrls.length > 4) throw new Error('Invalid relay configuration')
  const urls = config.additionalRelayUrls.map(value => {
    if (typeof value !== 'string') throw new Error('Invalid relay URL')
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Relay requires a plain HTTPS origin')
    return url.href
  })
  return [...new Set(urls)].flatMap(url => ['--additional-relay', url])
}

export async function exchangeAuthentication(connection, authority, fetcher = fetch, signal) {
  const url = connection.authenticatedUrl(`http://${authority}/`)
  const res = await fetcher(url, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) })
  try {
    const cookies = res.headers.getSetCookie()
    if (res.status !== 303 || cookies.length !== 1) throw new Error('DSH browser authentication unavailable')
    const cookie = cookies[0].split(';', 1)[0]
    if (!cookie.includes('=') || /[\r\n]/.test(cookie)) throw new Error('Invalid authentication response')
    return { type: 'proxy-auth', cookie, authority }
  } finally { await res.body?.cancel() }
}

export function observeApprovals(ctx, sidecar) {
  ctx.on('approval/request', async (request, next) => {
    const id = request.callId ?? randomUUID()
    // Notification failure must never take ownership of or change an approval.
    sidecar.send({ type: 'approval', id, tool_name: request.toolName ?? '', reason: request.reason ?? '' })
    try { return await next() }
    finally { sidecar.send({ type: 'approval-cancel', id }) }
  }, { prepend: true })
}

export async function apply(ctx) {
  assertPlatform()
  const server = ctx.webServer
  if (server.host !== '127.0.0.1' || !Number.isInteger(server.port) || server.port < 1) throw new Error('Tether requires the active loopback DSH web server')
  const binary = fileURLToPath(new URL('../bin/darwin-arm64/tether-host', import.meta.url))
  await access(binary, constants.X_OK)
  const authority = `127.0.0.1:${server.port}`
  const controller = new AbortController()
  ctx.effect(() => () => controller.abort(), 'tether: cancel authentication')
  // Do not start an unauthenticated tunnel if the official exchange is unavailable.
  let auth
  try { auth = await exchangeAuthentication(ctx.connection, authority, fetch, controller.signal) }
  catch { throw new Error('DSH 0.2.0-rc.2 browser authentication is unavailable') }
  const directory = await dataDirectory(ctx.dshHomePath)
  const relayArgs = await additionalRelayArguments(directory)
  const sidecar = new Sidecar(binary, ['host', '--data-dir', directory, '--proxy-target', authority, '--lang', 'en', ...relayArgs])
  ctx.effect(() => () => sidecar.stop(), 'tether: owned sidecar')
  try {
    await sidecar.ready
    sidecar.send(auth)
    auth = undefined
    ctx.effect(() => registerRoutes(server, ctx.connection, sidecar), 'tether: local control routes')
    observeApprovals(ctx, sidecar)
    // No auth URL, cookie, pairing code, device name or model text is logged.
    const timer = setInterval(async () => {
      try { sidecar.send(await exchangeAuthentication(ctx.connection, authority, fetch, controller.signal)) }
      catch { await sidecar.stop() }
    }, 12 * 60 * 60 * 1000)
    timer.unref?.()
    ctx.effect(() => () => clearInterval(timer), 'tether: auth renewal')
  } catch (error) { await sidecar.stop(); throw error }
}
