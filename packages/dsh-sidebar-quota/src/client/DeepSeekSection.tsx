import type { SidebarQuotaState } from '../shared/types.ts'
import { ProviderSection,ValueRow,money,ESTIMATE,lastUpdated,type ProviderControls } from './ProviderSection.tsx'
export function DeepSeekSection({state,now,controls}:{state:SidebarQuotaState['deepseek']|undefined;now:number;controls:ProviderControls}) {
  const pricing=state?.pricing;const period=pricing?.period??'unknown'
  const peak=period==='peak';const discount=pricing?.discount==null?'折扣未知':`${Number((pricing.discount*10).toFixed(2))}折`
  const status=period==='unknown'?'峰谷规则待确认':peak?'🟧 当前峰时 · 原价':`🟦 当前谷时 · ${discount}`
  const next=pricing?.nextChangeAt?Math.max(0,Math.ceil((Date.parse(pricing.nextChangeAt)-now)/60000)):null
  const countdown=next===null?'--':`${Math.floor(next/60)}h ${next%60}m`
  const priceTip=[pricing?.error,pricing?.stale?'当前使用缓存或内置规则':'' ,pricing?.calendarUnknown?'该年份节假日日历尚未核实':'',lastUpdated(pricing?.updatedAt)].filter(Boolean).join('；')
  return <ProviderSection name="DeepSeek" controls={controls} updatedAt={state?.updatedAt}>
    <ValueRow label="今日消费" value={money(state?.todaySpend)+(state?.incompletePricing?' *':'')} title={[ESTIMATE,state?.usageWarning].filter(Boolean).join('；')} stale={!!state?.usageWarning}/>
    <ValueRow label="余额" value={money(state?.balance)} title={[state?.error,lastUpdated(state?.updatedAt)].filter(Boolean).join('；')} stale={state?.stale}/>
    <div className={`dshsq-period${pricing?.stale?' dshsq-stale':''}`} title={priceTip}>{status}</div>
    {period==='holiday'?<div className="dshsq-note">节假日全天谷价</div>:period==='weekend'?<div className="dshsq-note">周末全天谷价</div>:<ValueRow label={pricing?.nextChangeType==='offpeak'?'距谷时':'距峰时'} value={countdown} title={priceTip}/>}
  </ProviderSection>
}
