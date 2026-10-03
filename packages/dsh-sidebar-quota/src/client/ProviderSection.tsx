import type { ReactNode } from 'react'
export function ProviderSection({name,children}:{name:string;children:ReactNode}) {
  return <section className="dshsq-provider" aria-label={name}><h3>{name}</h3>{children}</section>
}
export function ValueRow({label,value,title,stale=false}:{label:string;value:string;title?:string;stale?:boolean}) {
  return <div className={`dshsq-row${stale?' dshsq-stale':''}`} title={title}><span>{label}</span><span className="dshsq-value">{value}</span></div>
}
export const money=(amount:number|null|undefined)=>amount==null?'--':`¥${amount.toFixed(2)}`
export const ESTIMATE='本机 DSH 今日估算消费，不包含其他设备和客户端'
export function lastUpdated(at:string|null|undefined):string {
  return at ? `上次成功更新：${new Date(at).toLocaleString()}` : '尚未成功更新'
}
