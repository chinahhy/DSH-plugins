import type { PricingHistory } from '../pricing/pricing-history.ts'
import type { UsageRecord } from './session-reader.ts'
export function aggregateUsage(records: UsageRecord[], deepseek: PricingHistory, moonshot: PricingHistory) {
  const result = { deepseek:{ amount:0 as number|null,incomplete:false,calls:0 }, moonshot:{ amount:0 as number|null,incomplete:false,calls:0 } }
  const priced={deepseek:0,moonshot:0}
  for (const record of records) {
    const provider = ['deepseek','deepseek-official'].includes(record.provider) ? 'deepseek' : 'moonshot'
    const cost=(provider==='deepseek' ? deepseek : moonshot).cost(record.model,record.at,record.usage)
    result[provider].calls++
    if (cost===null) result[provider].incomplete=true
    else { result[provider].amount!+=cost; priced[provider]++ }
  }
  for (const provider of ['deepseek','moonshot'] as const) if (result[provider].incomplete && !priced[provider]) result[provider].amount=null
  return result
}
