import type { Context, Credentials } from './contracts.ts'
export type ApiProvider = 'deepseek' | 'moonshot'
const ids = { deepseek: ['deepseek-official', 'deepseek'], moonshot: ['moonshotai-cn', 'moonshotai', 'moonshot', 'kimi'] }
const refs = { deepseek: ['DEEPSEEK_API_KEY'], moonshot: ['MOONSHOT_API_KEY', 'MOONSHOTAI_API_KEY', 'KIMI_API_KEY'] }
export async function apiKey(ctx: Context, provider: ApiProvider): Promise<string | null> {
  const service = ctx.get('credentials'); if (!service) return null
  // Follow the provider's actual apiKeyEnv config before ambient defaults.
  const loader = ctx.get('loader')
  if (loader?.entries) for (const entry of loader.entries()) {
    const options = entry.options
    if (provider === 'deepseek' && options?.name === '@deepseek-ai/dsh-llm-deepseek-api-key') {
      const ref = entry.fiber?.config?.apiKeyEnv?.get?.() ?? options.config?.apiKeyEnv
      const value = await resolve(service, ref); if (value) return value
    }
    const providers = options?.config?.providers
    for (const id of ids[provider]) {
      const value = await resolve(service, providers?.[id]?.apiKeyEnv); if (value) return value
    }
  }
  for (const id of ids[provider]) {
    const record: any = await service.readRecord(`llm-pi-ai/${id}`)
    if (record?.kind === 'api-key' && typeof record.key === 'string' && record.key) return record.key
  }
  for (const ref of refs[provider]) { const value = await resolve(service, ref); if (value) return value }
  return null
}
async function resolve(service: Credentials, ref: unknown): Promise<string | null> {
  if (typeof ref !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) return null
  return (await service.resolve(ref))?.value || null
}
export interface CodexCredential { access: string; accountId?: string }
function oauth(value: any): CodexCredential | null {
  if (value?.type !== 'oauth' || typeof value.access !== 'string' || !value.access) return null
  if (typeof value.expires === 'number' && value.expires <= Date.now()) return null
  return { access: value.access, ...(typeof value.accountId === 'string' ? { accountId: value.accountId } : {}) }
}
export async function codexCredential(ctx: Context): Promise<CodexCredential | null> {
  const service = ctx.get('credentials'); if (!service) return null
  for (const key of ['llm-pi-ai/openai-codex', 'subscriptions/codex']) {
    const record: any = await service.readRecord(key)
    const result = oauth(record?.payload); if (result) return result
  }
  // dsh-codex-subscription 2.5.1 keeps the selected credential in this official store.
  const vault: any = await service.readRecord('codex-subscription/accounts')
  const payload = vault?.payload
  if (Array.isArray(payload?.accounts)) {
    const selected = payload.accounts.find((a: any) => a.id === payload.activeId)
    const result = oauth(selected?.credential); if (result) return result
  }
  for (const ref of ['OPENAI_CODEX_SUBSCRIPTION_OAUTH', 'WSL043_OPENAI_CODEX_OAUTH', 'OPENAI_CODEX_OAUTH']) {
    const value = await resolve(service, ref)
    if (!value) continue
    try { const result = oauth(JSON.parse(value)); if (result) return result } catch { /* Never surface the raw value. */ }
  }
  return null
}
