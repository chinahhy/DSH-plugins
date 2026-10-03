import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebServer } from './contracts.ts'
import type { QuotaMonitor } from './monitor.ts'
import { ROUTE,REFRESH_ROUTE,REFRESH_HEADER,PROVIDERS,type ProviderId } from '../shared/types.ts'
/** Local surface. Validate Host, Origin and peer address to reject DNS rebinding and remote access. */
export function allowedRequest(req:IncomingMessage,port:number|null):boolean {
  const peer=req.socket.remoteAddress
  if(peer && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))return false
  const hosts=[`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]
  if(port===null || !hosts.includes(req.headers.host??''))return false
  if(req.headers['sec-fetch-site']==='cross-site')return false
  if(req.headers.origin!==undefined){try{const origin=new URL(req.headers.origin);if(origin.protocol!=='http:' || !hosts.includes(origin.host))return false}catch{return false}}
  return true
}
export function registerRoute(server:WebServer,monitor:QuotaMonitor):()=>void {
  const send=(res:ServerResponse)=>{
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    res.end(JSON.stringify(monitor.snapshot()))
  }
  const state=server.register({kind:'exact',path:ROUTE,handler:(req:IncomingMessage,res:ServerResponse)=>{
    if(!allowedRequest(req,server.port)){res.writeHead(403);res.end();return}
    if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return}
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    res.end(req.method==='HEAD'?undefined:JSON.stringify(monitor.snapshot()))
  }})
  // Desktop's authenticated dsh-app proxy strips Origin. A custom header still
  // rejects form posts; cross-origin scripts require OPTIONS, which we deny.
  const refreshedAt=new Map<ProviderId,number>()
  const refresh=server.register({kind:'exact',path:REFRESH_ROUTE,handler:async(req:IncomingMessage,res:ServerResponse)=>{
    if(!allowedRequest(req,server.port)){res.writeHead(403);res.end();return}
    if(req.method!=='POST'){res.writeHead(405,{Allow:'POST'});res.end();return}
    if(req.headers[REFRESH_HEADER]!=='1'){res.writeHead(403);res.end();return}
    const provider=new URL(req.url??'','http://localhost').searchParams.get('provider')
    if(!PROVIDERS.includes(provider as ProviderId)){res.writeHead(400);res.end();return}
    const id=provider as ProviderId
    if(Date.now()-(refreshedAt.get(id)??0)<3000){res.writeHead(429,{'Retry-After':'3'});res.end();return}
    refreshedAt.set(id,Date.now())
    try{await monitor.refresh(id);send(res)}
    catch{res.writeHead(503);res.end()}
  }})
  return()=>{refresh();state()}
}
