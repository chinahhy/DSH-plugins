import type { PricingSchedule } from './schedule.ts'
export interface Rate { input: number; cacheRead: number; cacheWrite: number | null; output: number }
export interface ModelPrice { offpeak: Rate; peak?: Rate }
export interface PriceSnapshot {
  effectiveFrom: number; fetchedAt: number | null; source: string
  prices: Record<string, ModelPrice>; schedule?: PricingSchedule
}
export interface Usage { input: number; cacheRead: number; cacheWrite: number; output: number }
