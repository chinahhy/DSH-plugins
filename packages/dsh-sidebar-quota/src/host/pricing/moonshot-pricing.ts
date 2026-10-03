import { QueryError } from '../network.ts'
import type { ModelPrice, PriceSnapshot } from './types.ts'
export const MOONSHOT_PRICE_URL = 'https://platform.kimi.com/docs/pricing/chat.md'
export const MOONSHOT_FALLBACK: PriceSnapshot = {
  effectiveFrom: Date.parse('2026-10-03T00:00:00+08:00'), fetchedAt: null, source: MOONSHOT_PRICE_URL,
  prices: {
    'kimi-k3': { offpeak: { input:20, cacheRead:2, cacheWrite:null, output:100 } },
    'kimi-k2.7-code': { offpeak: { input:6.5, cacheRead:1.3, cacheWrite:6.5, output:27 } },
    'kimi-k2.7-code-highspeed': { offpeak: { input:13, cacheRead:2.6, cacheWrite:13, output:54 } },
    'kimi-k2.6': { offpeak: { input:6.5, cacheRead:1.1, cacheWrite:6.5, output:27 } },
  },
}
/** Official MDX contains DocTable literal rows. Parse only JSON string arrays; never evaluate downloaded code. */
export class MoonshotPricingProvider {
  parse(markdown: string, at = Date.now()): PriceSnapshot {
    const prices: Record<string, ModelPrice> = {}
    for (const table of markdown.matchAll(/<DocTable\b[\s\S]*?\/\>/g)) {
      const text = table[0]; const hasWrite = /缓存写入/.test(text)
      for (const row of text.matchAll(/\["kimi-[^\n]*?\]/g)) {
        let cells: string[]; try { cells = JSON.parse(row[0]) } catch { continue }
        const money = cells.filter(value => /^¥[\d.]+$/.test(value)).map(value=>Number(value.slice(1)))
        if (cells[1] !== '1M tokens' || money.length !== (hasWrite ? 5 : 3) || money.some(n=>!Number.isFinite(n))) continue
        const [cacheRead,input,output] = hasWrite ? money.slice(2) : money
        // DSH's generic cacheWriteTokens lacks TTL: do not silently price K3 at the cheaper write tier.
        prices[cells[0]] = { offpeak: { cacheRead,input,output,cacheWrite: hasWrite ? null : input } }
      }
    }
    if (!Object.keys(prices).length) throw new QueryError('MoonShot 官方价表解析失败')
    return { effectiveFrom:at, fetchedAt:at, source:MOONSHOT_PRICE_URL, prices }
  }
}
