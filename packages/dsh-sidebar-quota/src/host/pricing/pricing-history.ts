import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { PriceSnapshot, Usage, Rate } from './types.ts'
import { pricingPeriod } from './schedule.ts'
export class PricingHistory {
  snapshots: PriceSnapshot[]
  private file:string
  constructor(fallback: PriceSnapshot, file: string) { this.snapshots = [fallback];this.file=file }
  async load() {
    try {
      const data = JSON.parse(await readFile(this.file,'utf8'))
      if (Array.isArray(data) && data.every(validSnapshot)) this.snapshots = [this.snapshots[0], ...data.filter((s: PriceSnapshot)=>s.fetchedAt !== null)].sort((a,b)=>a.effectiveFrom-b.effectiveFrom)
    } catch { /* A missing or invalid cache never replaces the verified fallback. */ }
  }
  async accept(snapshot: PriceSnapshot) {
    const previous = this.snapshots.at(-1)!
    if (JSON.stringify([previous.prices,previous.schedule]) === JSON.stringify([snapshot.prices,snapshot.schedule])) {
      this.snapshots[this.snapshots.length-1] = { ...previous, fetchedAt:snapshot.fetchedAt }
    } else this.snapshots.push(snapshot)
    await mkdir(dirname(this.file),{recursive:true})
    const temporary = `${this.file}.tmp`; await writeFile(temporary,JSON.stringify(this.snapshots),{mode:0o600}); await rename(temporary,this.file)
  }
  at(timestamp: number): PriceSnapshot | null { return this.snapshots.findLast(s=>s.effectiveFrom<=timestamp) ?? null }
  cost(model: string, timestamp: number, usage: Usage): number | null {
    const snapshot = this.at(timestamp); const price = snapshot?.prices[model]
    if (!price || !snapshot) return null
    const period = snapshot.schedule ? pricingPeriod(timestamp,snapshot.schedule) : 'offpeak'
    if (period === 'unknown') return null
    const rate = period === 'peak' ? price.peak : price.offpeak
    if (!rate || usage.cacheWrite>0 && rate.cacheWrite === null) return null
    return (usage.input*rate.input + usage.cacheRead*rate.cacheRead + usage.cacheWrite*(rate.cacheWrite??0) + usage.output*rate.output) / 1_000_000
  }
}
function validRate(rate: any): rate is Rate { return rate && ['input','cacheRead','output'].every(k=>typeof rate[k]==='number' && Number.isFinite(rate[k]) && rate[k]>=0) && (rate.cacheWrite===null || typeof rate.cacheWrite==='number' && Number.isFinite(rate.cacheWrite) && rate.cacheWrite>=0) }
function validSnapshot(value: any): value is PriceSnapshot {
  return value && Number.isFinite(value.effectiveFrom) && (value.fetchedAt===null || Number.isFinite(value.fetchedAt)) && typeof value.source==='string'
    && value.prices && Object.values(value.prices).every((p:any)=>validRate(p.offpeak) && (!p.peak || validRate(p.peak)))
    && (!value.schedule || value.schedule.timezone==='Asia/Shanghai' && typeof value.schedule.weekendOff==='boolean' && typeof value.schedule.holidayOff==='boolean' && Array.isArray(value.schedule.windows) && value.schedule.windows.every((w:any)=>Array.isArray(w) && w.length===2 && Number.isFinite(w[0]) && Number.isFinite(w[1]) && w[0]>=0 && w[0]<w[1] && w[1]<=1440))
}
