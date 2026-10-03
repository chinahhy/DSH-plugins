import test from 'node:test'
import assert from 'node:assert/strict'
import {parseCodexUsage,WhamUsageProvider} from '../src/host/providers/codex.ts'
import {deepseekBalance} from '../src/host/providers/deepseek.ts'
import {moonshotBalance} from '../src/host/providers/moonshot.ts'
import {quotaLevel} from '../src/shared/types.ts'
import {safeError,type Transport} from '../src/host/network.ts'
import {apiKey,codexCredential} from '../src/host/credentials.ts'
const window=(used:number,seconds=18000)=>({used_percent:used,limit_window_seconds:seconds,reset_at:1900000000})
for(const [used,remaining] of [[18,82],[100,0],[0,100],[-5,100],[120,0]])test(`Codex ${used}% used → ${remaining}% remaining`,()=>{
  assert.equal(parseCodexUsage({rate_limit:{primary_window:window(used)}}).fiveHourRemaining,remaining)
})
test('classifies reversed windows by duration and never treats a weekly-only primary as 5h',()=>{
  assert.deepEqual([parseCodexUsage({rate_limit:{primary_window:window(39,604800)}}).fiveHourRemaining,parseCodexUsage({rate_limit:{primary_window:window(39,604800)}}).weeklyRemaining],[null,61])
  const result=parseCodexUsage({rate_limit:{primary_window:window(39,604800),secondary_window:window(18)}})
  assert.equal(result.fiveHourRemaining,82);assert.equal(result.weeklyRemaining,61)
})
test('absent duration, non-finite and malformed windows stay unknown independently',()=>{
  const result=parseCodexUsage({rate_limit:{primary_window:{used_percent:18},secondary_window:window(39,604800)}})
  assert.equal(result.fiveHourRemaining,null);assert.equal(result.weeklyRemaining,61)
  assert.equal(parseCodexUsage({rate_limit:{primary_window:window(NaN)}}).fiveHourRemaining,null)
  assert.throws(()=>parseCodexUsage({error:'bad'}))
})
for(const [percent,level] of [[100,'good'],[70,'good'],[69,'warning'],[40,'warning'],[39,'low'],[20,'low'],[19,'critical'],[0,'critical']] as const)test(`quota color ${percent} → ${level}`,()=>assert.equal(quotaLevel(percent),level))
test('balances parse CNY and available balance; reject missing fields',async()=>{
  const ds=(async()=>Response.json({balance_infos:[{currency:'USD',total_balance:'99'},{currency:'CNY',total_balance:'18.02'}]})) as Transport
  assert.equal(await deepseekBalance('fixture',ds),18.02)
  assert.equal(await moonshotBalance('fixture',(async()=>Response.json({code:0,data:{available_balance:43.8}})) as Transport),43.8)
  await assert.rejects(deepseekBalance('fixture',(async()=>Response.json({balance_infos:[{currency:'USD',total_balance:'99'}]})) as Transport))
})
test('HTTP failure never exposes body, headers, tokens or raw network errors',async()=>{
  const key='FAKE-KEY-DO-NOT-LEAK'
  try{await deepseekBalance(key,(async()=>new Response(key,{status:500})) as Transport)}catch(error){assert.equal(safeError(error),'查询失败：HTTP 500')}
  assert.equal(safeError(new Error(key)),'查询失败：配置或接口不可用')
  const transport=(async(_url,options)=>{assert.equal(options?.redirect,'error');assert.ok(options?.signal);return Response.json({rate_limit:{primary_window:window(18)}})}) as Transport
  assert.equal((await new WhamUsageProvider(transport).read({access:key})).fiveHourRemaining,82)
})
test('current DSH credential records and selected subscription account are reused without writes',async()=>{
  const ctx:any={get:(name:string)=>name==='credentials'?{
    resolve:async(ref:string)=>ref==='CUSTOM_DS'?{value:'custom-fixture'}:undefined,
    readRecord:async(key:string)=>key==='llm-pi-ai/moonshotai-cn'?{kind:'api-key',key:'moon-fixture'}:key==='codex-subscription/accounts'?{kind:'grant',payload:{activeId:'active',accounts:[{id:'old',credential:{type:'oauth',access:'old'}},{id:'active',credential:{type:'oauth',access:'selected',expires:Date.now()+3600000}}]}}:undefined,
  }:name==='loader'?{entries:()=>[{options:{name:'@deepseek-ai/dsh-llm-deepseek-api-key',config:{apiKeyEnv:'CUSTOM_DS'}}}]}:undefined}
  assert.equal(await apiKey(ctx,'deepseek'),'custom-fixture');assert.equal(await apiKey(ctx,'moonshot'),'moon-fixture');assert.equal((await codexCredential(ctx))?.access,'selected')
})
