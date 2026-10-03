import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from './contracts.ts'
import { QuotaMonitor } from './monitor.ts'
import { registerRoute } from './routes.ts'
export const name='dsh-sidebar-quota'
export const inject=['webServer','credentials']
export function apply(ctx:Context):void {
  const home=process.env.DSH_HOME?.trim()||join(homedir(),'.dsh')
  const monitor=new QuotaMonitor(ctx,home)
  ctx.effect(()=>registerRoute(ctx.get('webServer')!,monitor),'sidebar quota: read-only state route')
  ctx.effect(()=>()=>monitor.stop(),'sidebar quota: abort network requests')
  void monitor.start()
  const every=(ms:number,work:()=>unknown)=>{
    const timer=setInterval(()=>{void work()},ms);timer.unref()
    ctx.effect(()=>()=>clearInterval(timer),'sidebar quota: timer')
  }
  every(300_000,()=>Promise.allSettled([monitor.refreshDeepseek(),monitor.refreshMoonshot(),monitor.refreshCodex()]))
  every(20_000,()=>monitor.scan())
  every(6*3600_000,()=>monitor.refreshPricing())
  let turnTimer:ReturnType<typeof setTimeout>|null=null
  ctx.on('session/event',(_session,event)=>{
    if(!['assistant/message','assistant/attempt','compaction/summary'].includes(event.type))return
    if(turnTimer)clearTimeout(turnTimer)
    turnTimer=setTimeout(()=>{void monitor.scan();if(event.data?.message?.source?.provider==='openai-codex')void monitor.refreshCodex()},2000)
    turnTimer.unref()
  },{global:true})
  ctx.on('credentials/reference-updated',()=>{void monitor.refreshDeepseek();void monitor.refreshMoonshot();void monitor.refreshCodex()})
  ctx.on('credentials/record-updated',()=>{void monitor.refreshDeepseek();void monitor.refreshMoonshot();void monitor.refreshCodex()})
  ctx.effect(()=>()=>{if(turnTimer)clearTimeout(turnTimer)},'sidebar quota: turn debounce')
}
