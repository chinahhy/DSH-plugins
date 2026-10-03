import {projectTemp} from './temp.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'
import {FALLBACK_SCHEDULE,pricingPeriod,nextChange} from '../src/host/pricing/schedule.ts'
import {PricingHistory} from '../src/host/pricing/pricing-history.ts'
import {DEEPSEEK_FALLBACK,parseDeepseekPricing} from '../src/host/pricing/deepseek-pricing.ts'
import {MOONSHOT_FALLBACK,MoonshotPricingProvider} from '../src/host/pricing/moonshot-pricing.ts'
const time=(value:string)=>Date.parse(value)
for(const [at,period] of [['2026-09-29T10:00:00+08:00','peak'],['2026-09-29T13:00:00+08:00','offpeak'],['2026-09-19T10:00:00+08:00','weekend'],['2026-10-02T10:00:00+08:00','holiday'],['2026-09-20T10:00:00+08:00','weekend'],['2027-03-01T10:00:00+08:00','unknown']])test(`DeepSeek ${at} → ${period}`,()=>assert.equal(pricingPeriod(time(at),FALLBACK_SCHEDULE),period))
test('phase countdown crosses boundaries, midnight and holidays in official timezone',()=>{
  assert.equal(nextChange(time('2026-09-29T10:00:00+08:00'),FALLBACK_SCHEDULE)?.at,time('2026-09-29T12:00:00+08:00'))
  assert.equal(nextChange(time('2026-09-28T23:59:00+08:00'),FALLBACK_SCHEDULE)?.at,time('2026-09-29T09:00:00+08:00'))
  assert.equal(nextChange(time('2026-10-01T00:00:00+08:00'),FALLBACK_SCHEDULE)?.at,time('2026-10-08T09:00:00+08:00'))
})
test('each request keeps its own price period and snapshot; disjoint cache buckets are not subtracted twice',async()=>{
  const dir=await projectTemp('quota-pricing-')
  try{
    const history=new PricingHistory(DEEPSEEK_FALLBACK,join(dir,'price.json'))
    const usage={input:1_000_000,cacheRead:1_000_000,cacheWrite:0,output:1_000_000}
    assert.equal(history.cost('deepseek-flash',time('2026-10-12T10:00:00+08:00'),usage),10.04)
    assert.equal(history.cost('deepseek-flash',time('2026-10-12T13:00:00+08:00'),usage),5.02)
    await history.accept({...DEEPSEEK_FALLBACK,effectiveFrom:time('2026-10-12T12:30:00+08:00'),fetchedAt:time('2026-10-12T12:30:00+08:00'),prices:{'deepseek-flash':{offpeak:{input:2,cacheRead:.04,cacheWrite:2,output:8},peak:{input:4,cacheRead:.08,cacheWrite:4,output:16}}}})
    assert.equal(history.cost('deepseek-flash',time('2026-10-12T10:00:00+08:00'),usage),10.04)
    assert.equal(history.cost('deepseek-flash',time('2026-10-12T13:00:00+08:00'),usage),10.04)
    const restored=new PricingHistory(DEEPSEEK_FALLBACK,join(dir,'price.json'));await restored.load()
    assert.equal(restored.cost('deepseek-flash',time('2026-10-12T10:00:00+08:00'),usage),10.04)
    assert.equal(restored.cost('deepseek-flash',time('2026-10-02T10:00:00+08:00'),usage),null)
  }finally{await rm(dir,{recursive:true,force:true})}
})
export const pricingHtml='<html><body><table><tr><th colspan="3">模型</th><th>deepseek-flash</th><th>deepseek-v4-pro</th></tr>'+['缓存命中','缓存未命中','输出'].map((name,i)=>`<tr><td rowspan="2">价格</td><td rowspan="2">${name}</td><td>空闲时段</td><td>${[.02,1,4][i]}元</td><td>${[.15,4.5,13.5][i]}元</td></tr><tr><td>高峰时段</td><td>${[.04,2,8][i]}元</td><td>${[.3,9,27][i]}元</td></tr>`).join('')+'</table><p>北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。</p></body></html>'
test('official merged table and schedule parse; upstream structural changes fail closed',()=>{
  const snapshot=parseDeepseekPricing(pricingHtml)
  assert.equal(snapshot.prices['deepseek-flash'].offpeak.input,1);assert.equal(snapshot.prices['deepseek-v4-pro'].peak?.output,27)
  assert.deepEqual(snapshot.schedule?.windows,[[540,720],[840,1080]])
  assert.throws(()=>parseDeepseekPricing('<html><body>price unknown</body></html>'))
})
test('MoonShot parses official literal rows without code evaluation; unknown models and TTL remain unpriced',()=>{
  const provider=new MoonshotPricingProvider()
  const data=provider.parse('<DocTable rows={[ ["kimi-k2.6", "1M tokens", "¥1.10", "¥6.50", "¥27.00", "262,144 tokens"] ]} />')
  assert.equal(data.prices['kimi-k2.6'].offpeak.cacheRead,1.1)
  const history=new PricingHistory(MOONSHOT_FALLBACK,'unused')
  assert.equal(history.cost('unknown',Date.now(),{input:1,cacheRead:0,cacheWrite:0,output:1}),null)
  assert.equal(history.cost('kimi-k3',Date.now(),{input:1,cacheRead:0,cacheWrite:1,output:1}),null)
})
