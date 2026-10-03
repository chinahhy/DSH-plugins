import {createElement} from 'react'
import {createStore,startPolling} from './store.ts'
import {SidebarQuota} from './SidebarQuota.tsx'
import css from './styles.css'
export const inject=['slots']
export function apply(ctx:any):void {
  const store=createStore()
  ctx.effect(()=>{
    const style=document.createElement('style')
    style.dataset.pluginCss='dsh-sidebar-quota'
    style.textContent=css
    document.head.appendChild(style)
    return ()=>style.remove()
  },'sidebar quota: scoped styles')
  ctx.effect(()=>startPolling(store),'sidebar quota: global store')
  const slots=ctx.get('slots')
  slots.inject('sidebar.footer.action',()=>slots.register({name:'sidebar.footer.action',id:'dsh-sidebar-quota',order:50},(props:{wide?:boolean})=>createElement(SidebarQuota,{store,wide:props.wide})))
}
