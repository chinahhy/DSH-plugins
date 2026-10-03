import { useEffect,useRef,useState } from 'react'
import { quotaLevel } from '../shared/types.ts'
export function QuotaBar({label,value,resetAt,error}:{label:string;value:number|null;resetAt?:string|null;error?:string}) {
  const previous=useRef<number|null>(null);const [pulse,setPulse]=useState(false)
  useEffect(()=>{
    if(value!==null && previous.current!==null && previous.current>10 && value<=10){setPulse(true);const timer=setTimeout(()=>setPulse(false),1000);previous.current=value;return()=>clearTimeout(timer)}
    previous.current=value
  },[value])
  const level=value===null?'unknown':quotaLevel(value)
  const title=error || `${label} 剩余额度${resetAt?`，重置于 ${new Date(resetAt).toLocaleString()}`:''}`
  return <div className={`dshsq-quota${pulse?' dshsq-pulse':''}`} title={title}>
    <span>{label}</span>
    <div className="dshsq-track" role="progressbar" aria-label={`${label} 剩余额度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value??undefined} aria-valuetext={value===null?'额度未知':`${Math.round(value)}%`}>
      {value!==null && <div className={`dshsq-fill dshsq-${level}`} style={{width:`${value}%`}}/>}
    </div>
    <span className={`dshsq-percent${value!==null && value<=20?` dshsq-text-${level}`:''}`}>{value===null?'--':`${Math.round(value)}%`}</span>
  </div>
}
