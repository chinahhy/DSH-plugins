import { join } from 'node:path'
import type { SidebarQuotaState, ApiState, CodexState, PricingState } from '../shared/types.ts'
import type { Context } from './contracts.ts'
import { apiKey, codexCredential } from './credentials.ts'
import { deepseekBalance } from './providers/deepseek.ts'
import { moonshotBalance } from './providers/moonshot.ts'
import { WhamUsageProvider, type CodexUsageProvider } from './providers/codex.ts'
import { request, boundedText, safeError, type Transport } from './network.ts'
import { PricingHistory } from './pricing/pricing-history.ts'
import { DEEPSEEK_FALLBACK, DEEPSEEK_PRICE_URL, parseDeepseekPricing } from './pricing/deepseek-pricing.ts'
import { MOONSHOT_FALLBACK, MOONSHOT_PRICE_URL, MoonshotPricingProvider } from './pricing/moonshot-pricing.ts'
import { pricingPeriod, nextChange } from './pricing/schedule.ts'
import { SessionReader } from './usage/session-reader.ts'
import { aggregateUsage } from './usage/usage-aggregator.ts'
const FIVE_MINUTES=300_000
const emptyApi=():ApiState=>({balance:null,todaySpend:null,incompletePricing:false,updatedAt:null,stale:true,usageUpdatedAt:null})
const emptyCodex=():CodexState=>({fiveHourRemaining:null,weeklyRemaining:null,fiveHourResetAt:null,weeklyResetAt:null,updatedAt:null,stale:true})
export class QuotaMonitor {
  readonly deepseekHistory:PricingHistory
  readonly moonshotHistory:PricingHistory
  readonly reader:SessionReader
  private deepseek=emptyApi(); private moonshot=emptyApi(); private codex=emptyCodex()
  private abort=new AbortController(); private pending=new Map<string,Promise<void>>()
  private updatedAt=new Date().toISOString(); private pricingError:string|undefined
  private scheduleMemo:{ minute:number; snapshot:unknown; state:PricingState }|null=null
  private ctx:Context; private transport:Transport;private codexProvider:CodexUsageProvider
  constructor(ctx:Context, home:string, transport:Transport=fetch, codexProvider:CodexUsageProvider=new WhamUsageProvider(transport), sessionsRoot=join(home,'sessions')) {
    this.ctx=ctx;this.transport=transport;this.codexProvider=codexProvider
    const storage=join(home,'storages','dsh-sidebar-quota')
    this.deepseekHistory=new PricingHistory(DEEPSEEK_FALLBACK,join(storage,'deepseek-pricing.json'))
    this.moonshotHistory=new PricingHistory(MOONSHOT_FALLBACK,join(storage,'moonshot-pricing.json'))
    this.reader=new SessionReader(sessionsRoot)
  }
  async start() {
    await Promise.all([this.deepseekHistory.load(),this.moonshotHistory.load()])
    if(this.abort.signal.aborted)return
    await Promise.allSettled([this.refreshDeepseek(),this.refreshMoonshot(),this.refreshCodex(),this.scan(),this.refreshPricing()])
  }
  stop() { this.abort.abort() }
  private once(key:string,work:()=>Promise<void>):Promise<void> {
    if(this.abort.signal.aborted)return Promise.resolve()
    const existing=this.pending.get(key);if(existing)return existing
    const promise=work().finally(()=>{this.pending.delete(key)});this.pending.set(key,promise);return promise
  }
  refreshDeepseek() { return this.once('deepseek',async()=>{
    try {
      const key=await apiKey(this.ctx,'deepseek')
      if(!key){this.deepseek={...this.deepseek,balance:null,stale:true,error:'未配置 DeepSeek API Key'};return}
      const balance=await deepseekBalance(key,this.transport,this.abort.signal)
      if(!this.abort.signal.aborted)this.deepseek={...this.deepseek,balance,updatedAt:new Date().toISOString(),stale:false,error:undefined}
    }catch(error){this.deepseek={...this.deepseek,balance:null,stale:true,error:safeError(error)}}
    finally{this.updatedAt=new Date().toISOString()}
  }) }
  refreshMoonshot() { return this.once('moonshot',async()=>{
    try {
      const key=await apiKey(this.ctx,'moonshot')
      if(!key){this.moonshot={...this.moonshot,balance:null,stale:true,error:'未配置 MoonShot API Key'};return}
      const balance=await moonshotBalance(key,this.transport,this.abort.signal)
      if(!this.abort.signal.aborted)this.moonshot={...this.moonshot,balance,updatedAt:new Date().toISOString(),stale:false,error:undefined}
    }catch(error){this.moonshot={...this.moonshot,balance:null,stale:true,error:safeError(error)}}
    finally{this.updatedAt=new Date().toISOString()}
  }) }
  refreshCodex() { return this.once('codex',async()=>{
    try {
      const credential=await codexCredential(this.ctx)
      if(!credential){this.codex={...emptyCodex(),error:'未检测到有效 Codex OAuth 登录'};return}
      const usage=await this.codexProvider.read(credential,this.abort.signal)
      // Each successful response replaces both windows; missing 5h never inherits an old value.
      if(!this.abort.signal.aborted)this.codex={...usage,updatedAt:new Date().toISOString(),stale:false}
    }catch(error){this.codex={...emptyCodex(),error:safeError(error)}}
    finally{this.updatedAt=new Date().toISOString()}
  }) }
  scan() { return this.once('scan',async()=>{
    try {
      const usage=await this.reader.scan(Date.now(),this.abort.signal);if(this.abort.signal.aborted)return
      const sums=aggregateUsage(usage.records,this.deepseekHistory,this.moonshotHistory)
      for(const id of ['deepseek','moonshot'] as const){
        const value=sums[id];this[id]={...this[id],todaySpend:value.amount,incompletePricing:value.incomplete || usage.incomplete,usageUpdatedAt:new Date().toISOString(),
          usageWarning:usage.incomplete?'部分日志无法读取或格式异常，消费统计可能不完整':value.incomplete?'存在无法计价调用；金额仅为已计价部分，未知模型或缓存写入 TTL 未计入':undefined}
      }
    }catch{for(const id of ['deepseek','moonshot'] as const)this[id]={...this[id],incompletePricing:true,usageWarning:'本机日志统计失败，显示上次统计值'}}
    this.updatedAt=new Date().toISOString()
  }) }
  refreshPricing() { return this.once('pricing',async()=>{
    await Promise.allSettled([
      (async()=>{try{
        const html=await boundedText(await request(DEEPSEEK_PRICE_URL,{},this.transport,this.abort.signal))
        if(this.abort.signal.aborted)return
        await this.deepseekHistory.accept(parseDeepseekPricing(html));this.pricingError=undefined
      }catch(error){this.pricingError=safeError(error)}})(),
      (async()=>{try{
        const markdown=await boundedText(await request(MOONSHOT_PRICE_URL,{},this.transport,this.abort.signal))
        if(this.abort.signal.aborted)return
        await this.moonshotHistory.accept(new MoonshotPricingProvider().parse(markdown))
      }catch{/* Dated official local table is retained; unknown models stay unpriced. */}})(),
    ])
    this.scheduleMemo=null
    await this.scan()
  }) }
  snapshot(now=Date.now()):SidebarQuotaState {
    const snapshot=this.deepseekHistory.at(now)
    const minute=Math.floor(now/60_000)
    if(!this.scheduleMemo || this.scheduleMemo.minute!==minute || this.scheduleMemo.snapshot!==snapshot){
      const period=snapshot?.schedule ? pricingPeriod(now,snapshot.schedule):'unknown'
      const next=snapshot?.schedule ? nextChange(now,snapshot.schedule):null
      const price=snapshot?.prices['deepseek-flash'];const ratio=price?.peak && price.peak.input>0?price.offpeak.input/price.peak.input:null
      this.scheduleMemo={minute,snapshot,state:{period,discount:ratio,nextChangeAt:next?new Date(next.at).toISOString():null,nextChangeType:next?.type??null,
        updatedAt:snapshot?.fetchedAt?new Date(snapshot.fetchedAt).toISOString():null,stale:!!this.pricingError || !snapshot?.fetchedAt || now-snapshot.fetchedAt>24*3600_000,calendarUnknown:period==='unknown',error:this.pricingError}}
    }
    const fresh=(value:ApiState):ApiState=>({...value,stale:value.stale || !value.updatedAt || now-Date.parse(value.updatedAt)>2*FIVE_MINUTES})
    // Codex never presents stale cached quota as a live remaining amount.
    const expired=!this.codex.updatedAt || now-Date.parse(this.codex.updatedAt)>2*FIVE_MINUTES
    const codex=expired?{...this.codex,fiveHourRemaining:null,weeklyRemaining:null,stale:true}:this.codex
    return {updatedAt:this.updatedAt,deepseek:{...fresh(this.deepseek),pricing:this.scheduleMemo.state},codex:{...codex},moonshot:fresh(this.moonshot)}
  }
}
