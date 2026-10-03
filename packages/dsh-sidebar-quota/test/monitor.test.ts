import {projectTemp} from './temp.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'
import {QuotaMonitor} from '../src/host/monitor.ts'
import {allowedRequest} from '../src/host/routes.ts'
import type {Transport} from '../src/host/network.ts'
const credential='FAKE-HOST-ONLY-KEY'
const ctx:any={get:(name:string)=>name==='credentials'?{resolve:async(ref:string)=>ref.includes('CODEX')?{value:JSON.stringify({type:'oauth',access:credential,expires:Date.now()+3600000})}:{value:credential},readRecord:async()=>undefined}:undefined}
test('DeepSeek HTTP 500 does not affect Codex or MoonShot, and Browser state cannot contain credentials',async()=>{
  const home=await projectTemp('quota-monitor-')
  const transport=(async(url:any)=>url.includes('api.deepseek.com')?new Response(credential,{status:500}):url.includes('api.moonshot.cn')?Response.json({code:0,data:{available_balance:43.8}}):url.includes('wham/usage')?Response.json({rate_limit:{primary_window:{used_percent:18,limit_window_seconds:18000},secondary_window:{used_percent:39,limit_window_seconds:604800}}}):new Response('pricing unavailable',{status:503})) as Transport
  const monitor=new QuotaMonitor(ctx,home,transport)
  try{
    await monitor.start();const state=monitor.snapshot();assert.equal(state.deepseek.balance,null);assert.equal(state.moonshot.balance,43.8);assert.equal(state.codex.fiveHourRemaining,82);assert.equal(state.codex.weeklyRemaining,61)
    assert.equal(state.deepseek.todaySpend,0);assert.equal(state.moonshot.todaySpend,0)
    assert.ok(!JSON.stringify(state).includes(credential));assert.ok(!JSON.stringify(state).includes('refresh_token'))
    const expired=monitor.snapshot(Date.now()+11*60000);assert.equal(expired.codex.fiveHourRemaining,null);assert.equal(expired.codex.stale,true)
  }finally{monitor.stop();await rm(home,{recursive:true,force:true})}
})
test('successful weekly-only response replaces prior 5h; credential service failures remain isolated',async()=>{
  const home=await projectTemp('quota-monitor-');let calls=0
  const transport=(async()=>Response.json({rate_limit:{primary_window:{used_percent:18,limit_window_seconds:++calls===1?18000:604800}}})) as Transport
  const monitor=new QuotaMonitor(ctx,home,transport)
  try{await monitor.refreshCodex();assert.equal(monitor.snapshot().codex.fiveHourRemaining,82);await monitor.refreshCodex();assert.equal(monitor.snapshot().codex.fiveHourRemaining,null);assert.equal(monitor.snapshot().codex.weeklyRemaining,82)}finally{monitor.stop();await rm(home,{recursive:true,force:true})}
})
test('HTTP trust fence rejects remote peers, cross-origin callers, DNS rebinding and unsupported hosts',()=>{
  const req=(host:string,peer='127.0.0.1',origin?:string):any=>({headers:{host,origin},socket:{remoteAddress:peer}})
  assert.equal(allowedRequest(req('127.0.0.1:3080'),3080),true)
  assert.equal(allowedRequest(req('127.0.0.1:3080','10.0.0.2'),3080),false)
  assert.equal(allowedRequest(req('127.0.0.1:3080','127.0.0.1','https://evil.example'),3080),false)
  assert.equal(allowedRequest(req('evil.example:3080'),3080),false)
})
test('manual DeepSeek refresh queries only its balance and joins concurrent upstream work',async()=>{
  const home=await projectTemp('quota-manual-');let calls=0,release!:(response:Response)=>void
  const transport=(async(url:any)=>{
    assert.equal(url,'https://api.deepseek.com/user/balance');calls++
    return new Promise<Response>(resolve=>{release=resolve})
  }) as Transport
  const monitor=new QuotaMonitor(ctx,home,transport)
  try {
    const first=monitor.refresh('deepseek'),second=monitor.refresh('deepseek')
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(calls,1)
    release(Response.json({balance_infos:[{currency:'CNY',total_balance:'20'}]}))
    await Promise.all([first,second])
    assert.equal(monitor.snapshot().deepseek.balance,20)
    assert.equal(monitor.snapshot().codex.updatedAt,null)
  }finally{monitor.stop();await rm(home,{recursive:true,force:true})}
})
