import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {registerRoute} from '../src/host/routes.ts'
import {createStore} from '../src/client/store.ts'
import type {SidebarQuotaState} from '../src/shared/types.ts'
import {REFRESH_HEADER} from '../src/shared/types.ts'

const fixture=(updatedAt='2026-10-03T08:00:00.000Z'):SidebarQuotaState=>({
  updatedAt,
  deepseek:{balance:18,todaySpend:2,stale:false,updatedAt,usageUpdatedAt:updatedAt,incompletePricing:false,pricing:{period:'offpeak',discount:.5,nextChangeAt:null,nextChangeType:null,calendarUnknown:false,updatedAt,stale:false}},
  moonshot:{balance:43,todaySpend:1,stale:false,updatedAt,usageUpdatedAt:updatedAt,incompletePricing:false},
  codex:{fiveHourRemaining:82,weeklyRemaining:61,fiveHourResetAt:null,weeklyResetAt:null,updatedAt,stale:false},
})

test('manual HTTP refresh rejects untrusted origins, invalid providers and repeat clicks without upstream work',async()=>{
  const routes=new Map<string,any>(),calls:string[]=[]
  const server=createServer((req,res)=>{const route=routes.get(new URL(req.url!,'http://localhost').pathname);if(route)void route.handler(req,res);else{res.writeHead(404);res.end()}})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const port=(server.address() as any).port,base=`http://127.0.0.1:${port}`
  const dispose=registerRoute({port,register:route=>{routes.set(route.path,route);return()=>{routes.delete(route.path)}}},
    {snapshot:()=>fixture(),refresh:async(id:string)=>{calls.push(id)}} as any)
  const send=(path:string,method='POST',origin:string|undefined=base)=>fetch(base+path,{method,headers:{[REFRESH_HEADER]:'1',...(origin?{Origin:origin}:{})}})
  try {
    const path='/dsh-sidebar-quota/refresh?provider=deepseek'
    assert.equal((await send(path,'GET')).status,405)
    assert.equal((await send(path,'POST','https://untrusted.example')).status,403)
    assert.equal((await fetch(base+path,{method:'POST'})).status,403)
    assert.equal((await send(path,'OPTIONS')).status,405)
    for(const origin of ['', 'null', 'http://localhost:1'])assert.equal((await fetch(base+path,{method:'POST',headers:{[REFRESH_HEADER]:'1',Origin:origin}})).status,403)
    assert.equal((await fetch(base+path,{method:'POST',headers:{[REFRESH_HEADER]:'1','Sec-Fetch-Site':'cross-site'}})).status,403)
    assert.equal((await send('/dsh-sidebar-quota/refresh?provider=unexpected')).status,400)
    assert.deepEqual(calls,[])
    const response=await send(path);assert.equal(response.status,200);assert.equal((await response.json()).deepseek.balance,18)
    assert.equal(response.headers.get('cache-control'),'no-store')
    const repeat=await send(path);assert.equal(repeat.status,429);assert.equal(repeat.headers.get('retry-after'),'3')
    assert.equal((await send('/dsh-sidebar-quota/refresh?provider=codex')).status,200)
    assert.deepEqual(calls,['deepseek','codex'])
    // The real Desktop proxy forwards POSTs without Origin or Sec-Fetch-Site.
    const native=await fetch(base+'/dsh-sidebar-quota/refresh?provider=moonshot',{method:'POST',headers:{[REFRESH_HEADER]:'1'}})
    assert.equal(native.status,200)
    assert.deepEqual(calls,['deepseek','codex','moonshot'])
    assert.equal((await fetch(base+'/dsh-sidebar-quota/state')).status,200)
    assert.deepEqual(calls,['deepseek','codex','moonshot'])
    dispose();assert.equal(routes.size,0)
  }finally{server.close();await once(server,'close')}
})

test('client refresh joins repeat clicks, preserves preferences and rejects an older state poll',async()=>{
  const nativeFetch=globalThis.fetch,store=createStore();let resolveResponse!:(response:Response)=>void,calls=0
  globalThis.fetch=(async(input,init)=>{
    calls++;assert.equal(String(input),'/dsh-sidebar-quota/refresh?provider=deepseek');assert.equal(init?.method,'POST');assert.equal(new Headers(init?.headers).get(REFRESH_HEADER),'1')
    return new Promise<Response>(resolve=>{resolveResponse=resolve})
  }) as typeof fetch
  try {
    store.toggle('moonshot')
    const initial=fixture();store.set({state:initial})
    const refresh=store.refresh('deepseek');await store.refresh('deepseek')
    assert.equal(calls,1);assert.equal(store.getSnapshot().refreshing.deepseek,true)
    const newest=fixture('2026-10-03T08:01:00.000Z');newest.deepseek.balance=19
    resolveResponse(Response.json(newest));await refresh
    store.accept(initial)
    assert.equal(store.getSnapshot().state?.deepseek.balance,19)
    assert.equal(store.getSnapshot().refreshing.deepseek,false)
    assert.equal(store.getSnapshot().collapsed.moonshot,true)
  }finally{globalThis.fetch=nativeFetch;store.stop()}
})

test('failed manual Codex refresh hides old percentages and keeps other provider data usable',async()=>{
  const nativeFetch=globalThis.fetch,store=createStore();store.set({state:fixture()})
  globalThis.fetch=async()=>{throw new Error('untrusted upstream details')}
  try {
    await store.refresh('codex')
    const snapshot=store.getSnapshot()
    assert.equal(snapshot.state?.codex.fiveHourRemaining,null)
    assert.equal(snapshot.state?.codex.weeklyRemaining,null)
    assert.equal(snapshot.state?.deepseek.balance,18)
    assert.equal(snapshot.refreshing.codex,false)
    assert.equal(snapshot.refreshErrors.codex,'刷新失败，请稍后重试')
    assert.ok(!JSON.stringify(snapshot).includes('untrusted'))
  }finally{globalThis.fetch=nativeFetch;store.stop()}
})

test('automatic recovery clears manual error only after a newer successful provider query',async()=>{
  const nativeFetch=globalThis.fetch,store=createStore();const initial=fixture();store.set({state:initial})
  globalThis.fetch=async()=>{throw new Error('connection interrupted')}
  try{
    await store.refresh('codex')
    // A usage scan can advance the overall snapshot without fresh Codex data.
    const oldQuota=fixture('2026-10-03T08:00:20.000Z');oldQuota.codex.updatedAt=initial.codex.updatedAt
    store.accept(oldQuota)
    assert.equal(store.getSnapshot().state?.codex.fiveHourRemaining,null)
    assert.ok(store.getSnapshot().refreshErrors.codex)
    const recovered=fixture('2026-10-03T08:01:00.000Z');store.accept(recovered)
    assert.equal(store.getSnapshot().state?.codex.fiveHourRemaining,82)
    assert.equal(store.getSnapshot().refreshErrors.codex,undefined)
    store.accept(oldQuota)
    assert.equal(store.getSnapshot().state?.codex.updatedAt,recovered.codex.updatedAt)
  }finally{globalThis.fetch=nativeFetch;store.stop()}
})
test('automatic recovery from an upstream manual error does not retain the error icon',async()=>{
  const nativeFetch=globalThis.fetch,store=createStore();store.set({state:fixture()})
  const failed=fixture('2026-10-03T08:00:20.000Z');failed.codex={...failed.codex,updatedAt:null,stale:true,fiveHourRemaining:null,weeklyRemaining:null,error:'查询失败：请求超时'}
  globalThis.fetch=async()=>Response.json(failed)
  try{
    await store.refresh('codex');assert.equal(store.getSnapshot().refreshErrors.codex,'查询失败：请求超时')
    store.accept(fixture('2026-10-03T08:01:00.000Z'))
    assert.equal(store.getSnapshot().refreshErrors.codex,undefined)
    assert.equal(store.getSnapshot().state?.codex.fiveHourRemaining,82)
  }finally{globalThis.fetch=nativeFetch;store.stop()}
})
test('a late failed manual request cannot erase newer quota delivered by a poll',async()=>{
  const nativeFetch=globalThis.fetch,store=createStore();store.set({state:fixture()});let rejectRequest!:(error:Error)=>void
  globalThis.fetch=async()=>new Promise<Response>((_resolve,reject)=>{rejectRequest=reject})
  try{
    const pending=store.refresh('codex');const recovered=fixture('2026-10-03T08:01:00.000Z');store.accept(recovered)
    rejectRequest(new Error('old request failure'));await pending
    assert.equal(store.getSnapshot().state?.codex.fiveHourRemaining,82)
    assert.equal(store.getSnapshot().refreshErrors.codex,undefined)
    assert.equal(store.getSnapshot().refreshing.codex,false)
  }finally{globalThis.fetch=nativeFetch;store.stop()}
})

test('manual click cooldown does not invalidate still-fresh Codex quota',async()=>{
  const nativeFetch=globalThis.fetch,store=createStore();const initial=fixture();store.set({state:initial})
  globalThis.fetch=async()=>new Response(null,{status:429})
  try{
    await store.refresh('codex')
    assert.equal(store.getSnapshot().state?.codex.fiveHourRemaining,82)
    assert.equal(store.getSnapshot().refreshErrors.codex,'请稍候 3 秒再刷新')
    store.accept(initial)
    assert.equal(store.getSnapshot().state?.codex.fiveHourRemaining,82)
    assert.equal(store.getSnapshot().refreshErrors.codex,undefined)
  }finally{globalThis.fetch=nativeFetch;store.stop()}
})
