export type Period = 'peak' | 'offpeak' | 'weekend' | 'holiday' | 'unknown'
export interface Freshness { updatedAt: string | null; stale: boolean; error?: string }
export interface PricingState extends Freshness {
  period: Period; discount: number | null; nextChangeAt: string | null
  nextChangeType: 'peak' | 'offpeak' | null; calendarUnknown: boolean
}
export interface ApiState extends Freshness {
  balance: number | null; todaySpend: number | null
  incompletePricing: boolean; usageWarning?: string; usageUpdatedAt: string | null
}
export interface CodexState extends Freshness {
  fiveHourRemaining: number | null; weeklyRemaining: number | null
  fiveHourResetAt: string | null; weeklyResetAt: string | null
}
export interface SidebarQuotaState {
  updatedAt: string; deepseek: ApiState & { pricing: PricingState }
  codex: CodexState; moonshot: ApiState
}
export const ROUTE = '/dsh-sidebar-quota/state'
export const REFRESH_ROUTE = '/dsh-sidebar-quota/refresh'
export const REFRESH_HEADER = 'dsh-sidebar-refresh'
export const PROVIDERS = ['deepseek','codex','moonshot'] as const
export type ProviderId = typeof PROVIDERS[number]
export function quotaLevel(value: number): 'good' | 'warning' | 'low' | 'critical' {
  return value >= 70 ? 'good' : value >= 40 ? 'warning' : value >= 20 ? 'low' : 'critical'
}
