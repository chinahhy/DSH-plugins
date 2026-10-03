import {useId,type ReactNode} from 'react'
import {RefreshIcon,ChevronIcon} from './ControlIcons.tsx'
export interface ProviderControls { collapsed:boolean;refreshing:boolean;refreshError?:string;onToggle:()=>void;onRefresh:()=>void }
export function ProviderSection({name,children,controls,updatedAt}:{name:string;children:ReactNode;controls:ProviderControls;updatedAt?:string|null}) {
  const contentId=useId()
  return <section className={`dshsq-provider${controls.collapsed?' dshsq-collapsed':''}`} aria-label={name}>
    <div className="dshsq-provider-heading">
      <h3>{name}</h3>
      <button type="button" className={`dshsq-control dshsq-refresh${controls.refreshError?' dshsq-refresh-error':''}`} disabled={controls.refreshing} aria-busy={controls.refreshing} aria-label={`刷新 ${name}`} title={controls.refreshing?'正在查询最新数据…':controls.refreshError??`刷新 ${name}；${lastUpdated(updatedAt)}`} onClick={controls.onRefresh}><RefreshIcon/></button>
      <button type="button" className="dshsq-control" aria-label={`${controls.collapsed?'展开':'折叠'} ${name}`} aria-expanded={!controls.collapsed} aria-controls={contentId} title={controls.collapsed?'展开详情':'折叠详情'} onClick={controls.onToggle}><ChevronIcon collapsed={controls.collapsed}/></button>
    </div>
    <span className="dshsq-sr-only" role="status">{controls.refreshing?'正在刷新':controls.refreshError??''}</span>
    <div id={contentId} hidden={controls.collapsed}>{children}</div>
  </section>
}
export function ValueRow({label,value,title,stale=false}:{label:string;value:string;title?:string;stale?:boolean}) {
  return <div className={`dshsq-row${stale?' dshsq-stale':''}`} title={title}><span>{label}</span><span className="dshsq-value">{value}</span></div>
}
export const money=(amount:number|null|undefined)=>amount==null?'--':`¥${amount.toFixed(2)}`
export const ESTIMATE='本机 DSH 今日估算消费，不包含其他设备和客户端'
export function lastUpdated(at:string|null|undefined):string {
  return at ? `上次成功更新：${new Date(at).toLocaleString()}` : '尚未成功更新'
}
