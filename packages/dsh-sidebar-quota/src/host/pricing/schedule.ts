import type { Period } from '../../shared/types.ts'
import { chinaDate, holiday } from './holidays.ts'
export interface PricingSchedule { timezone: 'Asia/Shanghai'; windows: [number, number][]; weekendOff: boolean; holidayOff: boolean }
export const FALLBACK_SCHEDULE: PricingSchedule = { timezone: 'Asia/Shanghai', windows: [[540,720],[840,1080]], weekendOff: true, holidayOff: true }
export function pricingPeriod(at: number, schedule: PricingSchedule): Period {
  const date = chinaDate(at); const isHoliday = holiday(at)
  if (schedule.holidayOff && isHoliday) return 'holiday'
  if (schedule.weekendOff && [0,6].includes(date.weekday)) return 'weekend'
  if (schedule.holidayOff && isHoliday === null) return 'unknown'
  return schedule.windows.some(([start,end]) => date.minute >= start && date.minute < end) ? 'peak' : 'offpeak'
}
export function nextChange(at: number, schedule: PricingSchedule): { at: number; type: 'peak' | 'offpeak' } | null {
  const current = pricingPeriod(at, schedule); if (current === 'unknown') return null
  const peak = current === 'peak'
  // At most one week plus a long public holiday. Minute-aligned scan is inexpensive and timezone independent.
  for (let t = Math.floor(at / 60_000) * 60_000 + 60_000; t <= at + 20 * 86400_000; t += 60_000) {
    const period = pricingPeriod(t, schedule)
    if (period === 'unknown') return null
    if ((period === 'peak') !== peak) return { at: t, type: peak ? 'offpeak' : 'peak' }
  }
  return null
}
