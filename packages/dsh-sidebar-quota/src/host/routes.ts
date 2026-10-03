import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebServer } from './contracts.ts'
import type { QuotaMonitor } from './monitor.ts'
import { ROUTE } from '../shared/types.ts'
/** Local read-only surface. Validate Host, Origin and peer address to reject DNS rebinding and remote access. */
export function allowedRequest(req:IncomingMessage,port:number|null):boolean {
  const peer=req.socket.remoteAddress
  if(peer && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))return false
  const hosts=[`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]
  if(port===null || !hosts.includes(req.headers.host??''))return false
  if(req.headers['sec-fetch-site']==='cross-site')return false
  if(req.headers.origin){try{const origin=new URL(req.headers.origin);if(origin.protocol!=='http:' || !hosts.includes(origin.host))return false}catch{return false}}
  return true
}
export function registerRoute(server:WebServer,monitor:QuotaMonitor):()=>void {
  return server.register({kind:'exact',path:ROUTE,handler:(req:IncomingMessage,res:ServerResponse)=>{
    if(!allowedRequest(req,server.port)){res.writeHead(403);res.end();return}
    if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return}
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    res.end(req.method==='HEAD'?undefined:JSON.stringify(monitor.snapshot()))
  }})
}
