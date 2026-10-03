import type { SidebarQuotaState } from '../shared/types.ts'
import { ROUTE } from '../shared/types.ts'
export interface Snapshot { state:SidebarQuotaState|null; error:string|null }
export function createStore() {
  let snapshot:Snapshot={state:null,error:null};const listeners=new Set<()=>void>()
  return {
    getSnapshot:()=>snapshot,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},
    set:(value:Snapshot)=>{snapshot=value;for(const listener of listeners)listener()},
  }
}
export type QuotaStore=ReturnType<typeof createStore>
function valid(value:any):value is SidebarQuotaState {
  const numeric=(n:unknown)=>n===null || typeof n==='number' && Number.isFinite(n)
  return value && typeof value.updatedAt==='string' && value.deepseek?.pricing && value.codex && value.moonshot
    && ['deepseek','moonshot'].every(id=>numeric(value[id].balance) && numeric(value[id].todaySpend))
    && numeric(value.codex.fiveHourRemaining) && numeric(value.codex.weeklyRemaining)
}
export function startPolling(store:QuotaStore):()=>void {
  const lifetime=new AbortController();let pending=false
  const load=async()=>{
    if(pending || lifetime.signal.aborted)return
    pending=true
    try {
      const response=await fetch(ROUTE,{cache:'no-store',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(15_000)])})
      if(!response.ok)throw new Error('state unavailable')
      const state=await response.json();if(!valid(state))throw new Error('incompatible state')
      if(!lifetime.signal.aborted)store.set({state,error:null})
    }catch{
      if(lifetime.signal.aborted)return
      const previous=store.getSnapshot().state
      // A transport failure explicitly dims balances; old Codex percentages disappear.
      const state=previous?{...previous,deepseek:{...previous.deepseek,stale:true},moonshot:{...previous.moonshot,stale:true},codex:{...previous.codex,fiveHourRemaining:null,weeklyRemaining:null,stale:true}}:null
      store.set({state,error:'暂时无法读取额度状态'})
    }finally{pending=false}
  }
  const visible=()=>{if(!document.hidden)void load()}
  const timer=setInterval(visible,5000);document.addEventListener('visibilitychange',visible);void load()
  return()=>{lifetime.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
}
