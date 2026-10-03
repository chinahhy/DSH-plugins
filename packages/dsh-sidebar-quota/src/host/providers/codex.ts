import type { CodexState } from '../../shared/types.ts'
import type { CodexCredential } from '../credentials.ts'
import { queryJson, QueryError, type Transport } from '../network.ts'
import { setTimeout as delay } from 'node:timers/promises'
export function parseCodexUsage(data: unknown): Pick<CodexState, 'fiveHourRemaining' | 'weeklyRemaining' | 'fiveHourResetAt' | 'weeklyResetAt'> {
  const result = { fiveHourRemaining: null, weeklyRemaining: null, fiveHourResetAt: null, weeklyResetAt: null } as Pick<CodexState, 'fiveHourRemaining' | 'weeklyRemaining' | 'fiveHourResetAt' | 'weeklyResetAt'>
  if (typeof data !== 'object' || !data) throw new QueryError('Codex 接口响应格式不兼容')
  const limits = (data as any).rate_limit
  if (typeof limits !== 'object' || !limits) throw new QueryError('Codex 接口缺少 rate_limit')
  for (const value of [limits.primary_window, limits.secondary_window]) {
    if (!value || typeof value.used_percent !== 'number' || !Number.isFinite(value.used_percent)) continue
    const prefix = value.limit_window_seconds === 18000 ? 'fiveHour' : value.limit_window_seconds === 604800 ? 'weekly' : null
    if (!prefix) continue
    result[`${prefix}Remaining`] = Math.max(0, Math.min(100, 100 - value.used_percent))
    if (typeof value.reset_at === 'number' && Number.isFinite(value.reset_at) && Math.abs(value.reset_at) < 8.64e12) result[`${prefix}ResetAt`] = new Date(value.reset_at * 1000).toISOString()
  }
  return result
}
/** An interface allows a future app-server implementation without coupling the UI. */
export interface CodexUsageProvider { read(credential: CodexCredential, signal?: AbortSignal): Promise<ReturnType<typeof parseCodexUsage>> }
export class WhamUsageProvider implements CodexUsageProvider {
  private transport: Transport
  constructor(transport: Transport = fetch) { this.transport=transport }
  async read(credential: CodexCredential, signal?: AbortSignal) {
    // Two bounded 12-second attempts fit within the Client's 30-second budget.
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted()
      try {
        return parseCodexUsage(await queryJson('https://chatgpt.com/backend-api/wham/usage', {
          Authorization: `Bearer ${credential.access}`,
          Accept: 'application/json', 'Cache-Control': 'no-store',
          ...(credential.accountId ? { 'ChatGPT-Account-Id': credential.accountId } : {}),
        }, this.transport, signal))
      } catch (error) {
        if (attempt > 0 || signal?.aborted || !(error instanceof QueryError) || !error.retryable) throw error
        await delay(350, undefined, { signal })
      }
    }
  }
}
