import { load } from 'cheerio/slim'
import { FALLBACK_SCHEDULE, type PricingSchedule } from './schedule.ts'
import type { ModelPrice, PriceSnapshot, Rate } from './types.ts'
import { QueryError } from '../network.ts'
export const DEEPSEEK_PRICE_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/'
const flash: ModelPrice = { offpeak: { input: 1, cacheRead: .02, cacheWrite: 1, output: 4 }, peak: { input: 2, cacheRead: .04, cacheWrite: 2, output: 8 } }
const pro: ModelPrice = { offpeak: { input: 4.5, cacheRead: .15, cacheWrite: 4.5, output: 13.5 }, peak: { input: 9, cacheRead: .3, cacheWrite: 9, output: 27 } }
export const DEEPSEEK_FALLBACK: PriceSnapshot = {
  // Dated local estimation baseline; this is not a claimed historical official effective date.
  effectiveFrom: Date.parse('2026-10-03T00:00:00+08:00'), fetchedAt: null, source: DEEPSEEK_PRICE_URL,
  prices: { 'deepseek-flash': flash, 'deepseek-v4-flash': flash, 'deepseek-v4-flash-vision-exp': flash, 'deepseek-v4-pro': pro }, schedule: FALLBACK_SCHEDULE,
}
/** Expand rowspan/colspan before interpreting labels: Docusaurus uses merged pricing rows. */
export function parseDeepseekPricing(html: string, at = Date.now()): PriceSnapshot {
  const $ = load(html); const prices: Record<string, ModelPrice> = {}
  $('table').each((_,table) => {
    const grid: string[][] = []
    $(table).find('tr').each((r,tr) => {
      grid[r] ??= []; let c = 0
      $(tr).children('th,td').each((_,cell) => {
        while (grid[r][c] !== undefined) c++
        const rowspan = Math.min(30, Number($(cell).attr('rowspan') ?? 1))
        const colspan = Math.min(30, Number($(cell).attr('colspan') ?? 1))
        const text = $(cell).text().trim().replace(/\s+/g,' ')
        for (let y=0;y<rowspan;y++) for (let x=0;x<colspan;x++) { grid[r+y] ??= []; grid[r+y][c+x] = text }
        c += colspan
      })
    })
    const header = grid.find(row => row.some(value => /^deepseek-[a-z0-9.-]+/i.test(value)))
    if (!header) return
    header.forEach((value,column) => {
      const model = value?.match(/^(deepseek-[a-z0-9.-]+)/i)?.[1]; if (!model) return
      const rates: { offpeak: Partial<Rate>; peak: Partial<Rate> } = { offpeak: {}, peak: {} }
      for (const row of grid) {
        const labels = row.slice(0,column).join(' ')
        const period = /空闲时段/.test(labels) ? 'offpeak' : /高峰时段/.test(labels) ? 'peak' : null
        if (!period) continue
        const amount = row[column]?.match(/^([\d.]+)\s*元$/)?.[1]; if (amount === undefined) continue
        const key = /输出/.test(labels) ? 'output' : /缓存未命中/.test(labels) ? 'input' : /缓存命中/.test(labels) ? 'cacheRead' : null
        if (key) rates[period][key] = Number(amount)
      }
      if (['input','cacheRead','output'].every(key => typeof (rates.offpeak as any)[key] === 'number' && typeof (rates.peak as any)[key] === 'number')) {
        rates.offpeak.cacheWrite = rates.offpeak.input!; rates.peak.cacheWrite = rates.peak.input!
        prices[model] = rates as ModelPrice
      }
    })
  })
  const text = $('body').text().replace(/\s+/g,' ')
  const rule = text.match(/北京时间周一至周五[^。]*为高峰时段[^。]*。/)?.[0]
  if (!rule || !/周末|其余时段/.test(rule) || !/中国法定节假日/.test(rule)) throw new QueryError('官方峰谷规则结构变化，继续使用上次规则')
  const windows = [...rule.matchAll(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g)].map(m => [Number(m[1])*60+Number(m[2]),Number(m[3])*60+Number(m[4])] as [number,number])
  if (!windows.length || windows.some(([a,b]) => a<0 || b>1440 || a>=b) || !prices['deepseek-flash'] || !prices['deepseek-v4-pro']) throw new QueryError('官方定价页解析失败，继续使用上次规则')
  if (/旧模型名.*deepseek-v4-flash/.test(text)) { prices['deepseek-v4-flash'] = prices['deepseek-flash']; prices['deepseek-v4-flash-vision-exp'] = prices['deepseek-flash'] }
  const schedule: PricingSchedule = { timezone: 'Asia/Shanghai', windows, weekendOff: /周末/.test(rule), holidayOff: /不含中国法定节假日/.test(rule) }
  return { effectiveFrom: at, fetchedAt: at, source: DEEPSEEK_PRICE_URL, prices, schedule }
}
