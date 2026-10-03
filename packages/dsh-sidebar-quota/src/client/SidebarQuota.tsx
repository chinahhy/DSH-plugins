import { useEffect,useState,useSyncExternalStore } from 'react'
import type { QuotaStore } from './store.ts'
import { DeepSeekSection } from './DeepSeekSection.tsx'
import { CodexSection } from './CodexSection.tsx'
import { MoonShotSection } from './MoonShotSection.tsx'
export function SidebarQuota({store,wide=true}:{store:QuotaStore;wide?:boolean}) {
  const {state,error}=useSyncExternalStore(store.subscribe,store.getSnapshot)
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer)},[])
  if(!wide)return <div className="dshsq dshsq-rail" aria-label="模型额度" title="展开侧栏查看模型额度">额度</div>
  return <div className="dshsq" aria-label="模型额度" title={error??undefined}>
    <div className="dshsq-heading"><span>模型额度</span></div>
    <DeepSeekSection state={state?.deepseek} now={now}/>
    <CodexSection state={state?.codex}/>
    <MoonShotSection state={state?.moonshot}/>
  </div>
}
