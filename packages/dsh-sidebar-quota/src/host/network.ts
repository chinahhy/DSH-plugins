export type Transport = typeof fetch
export class QueryError extends Error {}
export async function request(url: string, headers: Record<string, string> = {}, transport: Transport = fetch, parent?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(12_000)
  try {
    const response = await transport(url, {
      headers, signal: parent ? AbortSignal.any([timeout, parent]) : timeout,
      redirect: 'error', // Authorization must never follow a redirect to another host.
    })
    if (!response.ok) throw new QueryError(`查询失败：HTTP ${response.status}`)
    return response
  } catch (error) {
    if (error instanceof QueryError) throw error
    throw new QueryError('查询失败：网络不可用或请求超时')
  }
}
export async function boundedText(response: Response, limit = 2_000_000): Promise<string> {
  if (!response.body) throw new QueryError('响应内容为空')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break
      size += part.value.byteLength
      if (size > limit) throw new QueryError('响应超过安全大小限制')
      chunks.push(part.value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks).toString('utf8')
}
export async function queryJson(url: string, headers: Record<string, string>, transport: Transport = fetch, signal?: AbortSignal): Promise<any> {
  const response = await request(url, headers, transport, signal)
  try { return JSON.parse(await boundedText(response)) } catch (error) {
    if (error instanceof QueryError) throw error
    throw new QueryError('接口响应格式不兼容')
  }
}
export function safeError(error: unknown): string {
  return error instanceof QueryError ? error.message : '查询失败：配置或接口不可用'
}
export function number(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (value === '') return null
  const result = Number(value); return Number.isFinite(result) ? result : null
}
