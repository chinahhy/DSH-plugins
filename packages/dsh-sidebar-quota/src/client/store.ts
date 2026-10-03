import type { SidebarQuotaState,ProviderId } from '../shared/types.ts'
import { ROUTE,REFRESH_ROUTE,PROVIDERS } from '../shared/types.ts'
const COLLAPSE_KEY='dsh-sidebar-quota:collapsed:v1'
type Flags=Record<ProviderId,boolean>
const flags=():Flags=>({deepseek:false,codex:false,moonshot:false})
function savedCollapse():Flags {
  try {
    const value=JSON.parse(localStorage.getItem(COLLAPSE_KEY)??'{}')
    return Object.fromEntries(PROVIDERS.map(id=>[id,value?.[id]===true])) as Flags
  }catch{return flags()}
}
export interface Snapshot {
  state:SidebarQuotaState|null; error:string|null
  collapsed:Flags; refreshing:Flags; refreshErrors:Partial<Record<ProviderId,string>>
}
export function createStore() {
  let snapshot:Snapshot={state:null,error:null,collapsed:savedCollapse(),refreshing:flags(),refreshErrors:{}}
  const listeners=new Set<()=>void>(),lifetime=new AbortController()
  const set=(value:Partial<Snapshot>)=>{snapshot={...snapshot,...value};for(const listener of listeners)listener()}
  const accept=(state:SidebarQuotaState)=>{
    // An older poll must not replace a newer manual refresh response.
    if(!snapshot.state || Date.parse(state.updatedAt)>=Date.parse(snapshot.state.updatedAt))set({state,error:null})
  }
  const signal=(timeout=15_000)=>AbortSignal.any([lifetime.signal,AbortSignal.timeout(timeout)])
  return {
    getSnapshot:()=>snapshot,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},
    set,accept,signal,
    stop:()=>lifetime.abort(),
    toggle:(id:ProviderId)=>{
      const collapsed={...snapshot.collapsed,[id]:!snapshot.collapsed[id]}
      set({collapsed})
      try{localStorage.setItem(COLLAPSE_KEY,JSON.stringify(collapsed))}catch{/* Memory remains usable when storage is blocked. */}
    },
    refresh:async(id:ProviderId)=>{
      if(snapshot.refreshing[id] || lifetime.signal.aborted)return
      set({refreshing:{...snapshot.refreshing,[id]:true},refreshErrors:{...snapshot.refreshErrors,[id]:undefined}})
      try {
        const response=await fetch(`${REFRESH_ROUTE}?provider=${id}`,{method:'POST',cache:'no-store',signal:signal(30_000)})
        if(response.status===429){set({refreshErrors:{...snapshot.refreshErrors,[id]:'请稍候 3 秒再刷新'}});return}
        if(!response.ok)throw new Error('refresh unavailable')
        const state=await response.json();if(!valid(state))throw new Error('incompatible state')
        if(lifetime.signal.aborted)return
        accept(state)
        set({refreshErrors:{...snapshot.refreshErrors,[id]:state[id].error}})
      }catch{
        if(lifetime.signal.aborted)return
        const state=snapshot.state?{...snapshot.state,[id]:staleProvider(snapshot.state[id],id)}:null
        set({state,refreshErrors:{...snapshot.refreshErrors,[id]:'刷新失败，请稍后重试'}})
      }finally{if(!lifetime.signal.aborted)set({refreshing:{...snapshot.refreshing,[id]:false}})}
    },
  }
}
export type QuotaStore=ReturnType<typeof createStore>
function staleProvider(value:any,id:ProviderId) {
  return id==='codex'?{...value,fiveHourRemaining:null,weeklyRemaining:null,stale:true}:{...value,stale:true}
}
function valid(value:any):value is SidebarQuotaState {
  const numeric=(n:unknown)=>n===null || typeof n==='number' && Number.isFinite(n)
  return value && typeof value.updatedAt==='string' && value.deepseek?.pricing && value.codex && value.moonshot
    && ['deepseek','moonshot'].every(id=>numeric(value[id].balance) && numeric(value[id].todaySpend))
    && numeric(value.codex.fiveHourRemaining) && numeric(value.codex.weeklyRemaining)
}
export function startPolling(store:QuotaStore):()=>void {
  let stopped=false,pending=false
  const load=async()=>{
    if(pending || stopped)return
    pending=true
    try {
      const response=await fetch(ROUTE,{cache:'no-store',signal:store.signal()})
      if(!response.ok)throw new Error('state unavailable')
      const state=await response.json();if(!valid(state))throw new Error('incompatible state')
      if(!stopped)store.accept(state)
    }catch{
      if(stopped)return
      const previous=store.getSnapshot().state
      // A transport failure explicitly dims balances; old Codex percentages disappear.
      const state=previous?{...previous,deepseek:{...previous.deepseek,stale:true},moonshot:{...previous.moonshot,stale:true},codex:{...previous.codex,fiveHourRemaining:null,weeklyRemaining:null,stale:true}}:null
      store.set({state,error:'暂时无法读取额度状态'})
    }finally{pending=false}
  }
  const visible=()=>{if(!document.hidden)void load()}
  const timer=setInterval(visible,5000);document.addEventListener('visibilitychange',visible);void load()
  return()=>{stopped=true;store.stop();clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
}
