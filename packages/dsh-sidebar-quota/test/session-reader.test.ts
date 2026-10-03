import {projectTemp} from './temp.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,writeFile,appendFile,rm,utimes} from 'node:fs/promises'
import {join} from 'node:path'
import {zstdCompressSync,constants} from 'node:zlib'
import {SessionReader,startOfDay} from '../src/host/usage/session-reader.ts'
import {aggregateUsage} from '../src/host/usage/usage-aggregator.ts'
import {PricingHistory} from '../src/host/pricing/pricing-history.ts'
import {DEEPSEEK_FALLBACK} from '../src/host/pricing/deepseek-pricing.ts'
import {MOONSHOT_FALLBACK} from '../src/host/pricing/moonshot-pricing.ts'
process.env.TZ='Asia/Shanghai'
const now=Date.parse('2026-10-03T12:00:00+08:00')
const event=(seq:number,time:number,provider='deepseek-official',model='deepseek-flash')=>({type:'assistant/message',seq,time,data:{turn:1,step:seq,message:{source:{provider,model}},usage:{inputTokens:100,cacheReadTokens:20,outputTokens:50}}})
const pack=(events:unknown[])=>zstdCompressSync(Buffer.from(events.map(e=>JSON.stringify(e)).join('\n')+'\n'),{params:{[constants.ZSTD_c_checksumFlag]:1}})
async function fixture(){const root=await projectTemp('quota-logs-');const session=join(root,'workspace','session');await mkdir(session,{recursive:true});return{root,session,file:join(session,'session.v4.jsonl.zstd')}}
test('today uses host local midnight, excludes yesterday; incremental append never rereads old bytes',async()=>{
  const f=await fixture();try{
    await writeFile(f.file,pack([{type:'session',id:'test',createdAt:now-86400000,isSeeded:false},event(1,startOfDay(now)-60000),event(2,startOfDay(now)+60000)]))
    const reader=new SessionReader(f.root);const first=await reader.scan(now);assert.equal(first.records.length,1)
    const read=reader.bytesRead;await reader.scan(now);assert.equal(reader.bytesRead,read)
    const added=pack([event(3,now-1000,'moonshotai-cn','kimi-k2.6')]);await appendFile(f.file,added)
    const second=await reader.scan(now);assert.equal(second.records.length,2);assert.ok(reader.bytesRead-read<=added.length+128)
    const totals=aggregateUsage(second.records,new PricingHistory(DEEPSEEK_FALLBACK,'unused'),new PricingHistory(MOONSHOT_FALLBACK,'unused'))
    assert.equal(totals.deepseek.calls,1);assert.equal(totals.moonshot.calls,1)
  }finally{await rm(f.root,{recursive:true,force:true})}
})
test('incomplete tail frame is retried only after complete; archived generations do not double-count',async()=>{
  const f=await fixture();try{
    const first=pack([event(1,now-3000)]);const next=pack([event(2,now-2000)])
    await writeFile(f.file,Buffer.concat([first,next.subarray(0,next.length-2)]));await writeFile(join(f.session,'session.jsonl.zstd'),first)
    const reader=new SessionReader(f.root);assert.equal((await reader.scan(now)).records.length,1)
    await appendFile(f.file,next.subarray(next.length-2));assert.equal((await reader.scan(now)).records.length,2)
  }finally{await rm(f.root,{recursive:true,force:true})}
})
test('fork inherited prefix is excluded; header state and incomplete attempts preserve provider identity',async()=>{
  const f=await fixture();try{
    await writeFile(f.file,pack([{type:'session',isSeeded:true,createdAt:now-1000},event(1,now-2000),{type:'session/end-seed',seq:2,time:now-1000,data:{inherited:true}},
      {type:'request/header',seq:3,time:now-1000,data:{header:{config:{provider:'moonshotai-cn',model:'kimi-k2.6'}}}},
      {type:'assistant/attempt',seq:4,time:now-500,data:{stream:[{chunk:{type:'usage',usage:{inputTokens:10,outputTokens:5}}}]}}]))
    const records=(await new SessionReader(f.root).scan(now)).records;assert.equal(records.length,1);assert.equal(records[0].provider,'moonshotai-cn')
  }finally{await rm(f.root,{recursive:true,force:true})}
})
test('rewritten or truncated logs reset cursors; corrupt session does not hide healthy sessions',async()=>{
  const f=await fixture();try{
    await writeFile(f.file,pack([event(1,now-3000),event(2,now-2000)]));const reader=new SessionReader(f.root);assert.equal((await reader.scan(now)).records.length,2)
    await writeFile(f.file,pack([event(3,now-1000)]));const result=await reader.scan(now);assert.equal(result.records.length,1);assert.equal(result.records[0].key,'step:1:3')
    const corrupt=join(f.root,'workspace','corrupt');await mkdir(corrupt);await writeFile(join(corrupt,'session.v4.jsonl.zstd'),Buffer.from('not-a-zstd-frame'))
    const isolated=await reader.scan(now);assert.equal(isolated.records.length,1);assert.equal(isolated.incomplete,true)
  }finally{await rm(f.root,{recursive:true,force:true})}
})
test('unchanged logs older than today are not decompressed; unsupported provider is excluded',async()=>{
  const f=await fixture();try{
    await writeFile(f.file,pack([event(1,now-1000,'openai','deepseek-flash')]));const reader=new SessionReader(f.root);assert.equal((await reader.scan(now)).records.length,0)
    await utimes(f.file,new Date(now-86400000),new Date(now-86400000));const cold=new SessionReader(f.root);await cold.scan(now);assert.equal(cold.bytesRead,0)
  }finally{await rm(f.root,{recursive:true,force:true})}
})
test('current assistant settlements fall back to stream usage and replace legacy chunks without double counting',async()=>{
  const f=await fixture();try{
    const usage={inputTokens:120,cacheReadTokens:30,outputTokens:60}
    await writeFile(f.file,pack([
      {type:'request/header',seq:0,time:now-1000,data:{header:{config:{provider:'deepseek-official',model:'deepseek-flash'}}}},
      {type:'assistant/chunk',seq:1,time:now-900,data:{turn:1,step:1,chunk:{type:'usage',usage}}},
      {type:'assistant/message',seq:2,time:now-800,data:{turn:1,step:1,stream:[{chunk:{type:'usage',usage}}]}}
    ]))
    const result=await new SessionReader(f.root).scan(now)
    assert.equal(result.records.length,1);assert.equal(result.records[0].usage.input,120)
    assert.equal(result.records[0].usage.cacheRead,30);assert.equal(result.incomplete,false)
  }finally{await rm(f.root,{recursive:true,force:true})}
})
