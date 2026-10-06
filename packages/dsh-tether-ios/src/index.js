import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, lstat, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, isAbsolute, relative, sep } from 'node:path'
import { Sidecar } from './sidecar.js'
import { registerRoutes } from './routes.js'
import { readRelayConfig, relayArguments, saveRelayConfig, RelayController } from './relay.js'

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

export async function additionalRelayArguments(directory) { return relayArguments(await readRelayConfig(directory)) }

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
  const directory = await dataDirectory(ctx.dshHomePath)
  const sidecar = new RelayController(await readRelayConfig(directory), {
    persist: (next, previous) => saveRelayConfig(directory, next, previous),
    start: async config => {
      const auth = await exchangeAuthentication(ctx.connection, authority, fetch, controller.signal)
      const child = new Sidecar(binary, ['host', '--data-dir', directory, '--proxy-target', authority, '--lang', 'en', ...relayArguments(config)])
      try {
        await child.ready
        if (controller.signal.aborted || !child.send(auth)) throw new Error('Authentication unavailable')
        // Verify the stdio loop has processed authentication before declaring ready.
        await child.request({ type: 'device-list' }, 'devices')
        return child
      } catch (error) { await child.stop(); throw error }
    },
  })
  ctx.effect(() => () => sidecar.stop(), 'tether: owned sidecar')
  try {
    await sidecar.initialize()
    ctx.effect(() => registerRoutes(server, ctx.connection, sidecar), 'tether: local control routes')
    observeApprovals(ctx, sidecar)
    const timer = setInterval(async () => {
      try { sidecar.send(await exchangeAuthentication(ctx.connection, authority, fetch, controller.signal)) }
      catch { await sidecar.stop() }
    }, 12 * 60 * 60 * 1000)
    timer.unref?.()
    ctx.effect(() => () => clearInterval(timer), 'tether: auth renewal')
  } catch (error) { await sidecar.stop(); throw error }
}
