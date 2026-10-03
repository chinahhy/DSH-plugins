import { readdir, stat, open } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompress } from 'node:zlib'
import { promisify } from 'node:util'
import { setImmediate as yieldLoop } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import type { Usage } from '../pricing/types.ts'
export interface UsageRecord { key: string; at: number; provider: string; model: string; usage: Usage }
interface Cursor {
  size: number; mtime: number; inode: number; offset: number; anchor: string; day: number
  seeded: boolean; inherited: boolean; createdAt: number; provider: string; model: string
  records: Map<string,UsageRecord>; warning: boolean
}
const decode = promisify(zstdDecompress)
const MAX_FRAME = 64 * 1024 * 1024
/** Parse the Zstandard container structurally; a magic byte sequence inside compressed data is not a boundary. */
export function frameEnd(buffer: Buffer): number | null {
  if (buffer.length < 5) return null
  if (buffer.readUInt32LE(0) !== 0xfd2fb528) throw new Error('Invalid Zstandard frame')
  const descriptor = buffer[4]
  if (descriptor & 0x18) throw new Error('Invalid frame descriptor')
  const single = (descriptor & 0x20) !== 0; const flag = descriptor >>> 6
  const dictionary = descriptor & 3
  let offset = 5 + (single ? 0 : 1) + (dictionary === 3 ? 4 : dictionary) + (flag === 0 ? (single ? 1 : 0) : 1 << flag)
  if (buffer.length < offset) return null
  while (true) {
    if (buffer.length < offset + 3) return null
    const block = buffer.readUIntLE(offset,3); const type = block >>> 1 & 3
    if (type === 3) throw new Error('Invalid block type')
    offset += 3 + (type === 1 ? 1 : block >>> 3)
    if (buffer.length < offset) return null
    if (block & 1) break
  }
  if (descriptor & 4) offset += 4
  return buffer.length < offset ? null : offset
}
export function startOfDay(now: number): number { const date = new Date(now); date.setHours(0,0,0,0); return date.getTime() }
async function listLogs(root: string): Promise<string[]> {
  const found: string[] = []
  async function visit(directory: string, depth: number) {
    if (depth > 4) return
    let entries; try { entries = await readdir(directory,{withFileTypes:true}) } catch (error: any) { if (error.code === 'ENOENT') return; throw error }
    const logs = entries.filter(e=>e.isFile() && /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(e.name))
    if (logs.length) {
      logs.sort((a,b)=>version(b.name)-version(a.name) || Number(b.name.endsWith('.zstd'))-Number(a.name.endsWith('.zstd')))
      found.push(join(directory,logs[0].name)) // Archived migration generations never count twice.
    }
    for (const e of entries) if (e.isDirectory()) await visit(join(directory,e.name),depth+1)
  }
  await visit(root,0); return found
}
function version(name: string): number { return Number(name.match(/\.v(\d+)\./)?.[1] ?? 0) }
function empty(day: number, inode: number): Cursor {
  return { size:0,mtime:0,inode,offset:0,anchor:'',day,seeded:false,inherited:false,createdAt:0,provider:'',model:'',records:new Map(),warning:false }
}
function count(value: unknown): number | null { return value === undefined ? 0 : typeof value === 'number' && Number.isFinite(value) && value>=0 ? value : null }
function consume(line: string, cursor: Cursor, now: number) {
  if (!/"(?:session|session\/end-seed|request\/header|assistant\/message|assistant\/attempt|assistant\/chunk|compaction\/summary)"/.test(line.slice(0,512))) return
  let event: any; try { event = JSON.parse(line) } catch { cursor.warning = true; return }
  if (event.type === 'session') {
    cursor.seeded = event.isSeeded === true || typeof event.parentSession === 'string'
    cursor.inherited = cursor.seeded; cursor.createdAt = Number(event.createdAt)||0; return
  }
  if (event.type === 'session/end-seed' && event.data?.inherited === true) {
    cursor.records.clear(); cursor.inherited = false; return
  }
  if (event.type === 'request/header') {
    cursor.provider = event.data?.header?.config?.provider ?? ''
    cursor.model = event.data?.header?.config?.model ?? ''; return
  }
  const at = event.time
  if (typeof at !== 'number' || !Number.isFinite(at) || at < cursor.day || at > now) return
  // Legacy forks have no tagged cut; their copied events precede child creation.
  if (cursor.seeded && at < cursor.createdAt) return
  if (cursor.inherited && at >= cursor.createdAt) cursor.inherited = false
  const streamUsage = Array.isArray(event.data?.stream)
    ? event.data.stream.findLast((s:any)=>s?.chunk?.type === 'usage')?.chunk?.usage : undefined
  let usage = event.data?.usage; let key = `seq:${event.seq}`
  if (event.type === 'assistant/attempt') {
    usage = streamUsage
    key = `attempt:${event.seq}`
  } else if (event.type === 'assistant/chunk') {
    if (event.data?.chunk?.type !== 'usage') return
    usage = event.data.chunk.usage; key = `step:${event.data.turn}:${event.data.step}`
  } else if (event.type === 'assistant/message') {
    usage ??= streamUsage
    key = `step:${event.data.turn}:${event.data.step}`
  }
  else if (event.type !== 'compaction/summary') return
  if (!usage) return
  const provider = event.data?.message?.source?.provider ?? event.data?.provider ?? cursor.provider
  const model = event.data?.message?.source?.model ?? event.data?.model ?? cursor.model
  if (!['deepseek','deepseek-official','moonshotai','moonshotai-cn','moonshot','kimi'].includes(provider)) return
  if (typeof model !== 'string' || !model) { cursor.warning=true; return }
  const values = [usage.inputTokens,usage.cacheReadTokens,usage.cacheWriteTokens,usage.outputTokens].map(count)
  if (values.some(n=>n===null)) { cursor.warning=true; return }
  const [input,cacheRead,cacheWrite,output] = values as number[]
  cursor.records.set(key,{ key,at,provider,model,usage:{input,cacheRead,cacheWrite,output} })
}
export class SessionReader {
  private cursors = new Map<string,Cursor>()
  bytesRead = 0
  private root:string
  constructor(root: string) { this.root=root }
  async scan(now = Date.now(), signal?: AbortSignal): Promise<{ records:UsageRecord[]; incomplete:boolean }> {
    const floor = startOfDay(now); const logs = await listLogs(this.root); const alive = new Set(logs)
    for (const file of this.cursors.keys()) if (!alive.has(file)) this.cursors.delete(file)
    let incomplete = false
    for (const file of logs) {
      if (signal?.aborted) break
      try {
        const info = await stat(file); let cursor = this.cursors.get(file)
        if (info.mtimeMs < floor && !cursor) continue
        if (!cursor || cursor.day !== floor || info.ino !== cursor.inode || info.size < cursor.offset || info.size===cursor.size && info.mtimeMs!==cursor.mtime) cursor=empty(floor,info.ino)
        const handle = await open(file,'r')
        try {
          const anchor = async (at: number) => {
            const buffer=Buffer.alloc(Math.min(64,at)); const read=await handle.read(buffer,0,buffer.length,at-buffer.length)
            this.bytesRead+=read.bytesRead; return createHash('sha256').update(buffer.subarray(0,read.bytesRead)).digest('hex')
          }
          if (cursor.offset>0 && info.size!==cursor.size && await anchor(cursor.offset)!==cursor.anchor) cursor=empty(floor,info.ino)
          if (info.size!==cursor.size || cursor.offset===0) {
            let pending=Buffer.alloc(0); let position=cursor.offset
            while (position < info.size && !signal?.aborted) {
              const part=Buffer.alloc(Math.min(1024*1024,info.size-position)); const read=await handle.read(part,0,part.length,position)
              if (!read.bytesRead) break
              this.bytesRead+=read.bytesRead; position+=read.bytesRead; pending=Buffer.concat([pending,part.subarray(0,read.bytesRead)])
              while (pending.length) {
                const end=file.endsWith('.zstd') ? frameEnd(pending) : pending.lastIndexOf(10)+1 || null
                if (end===null) break
                if (end>MAX_FRAME) throw new Error('Frame size limit')
                const bytes=pending.subarray(0,end)
                const text=file.endsWith('.zstd') ? (await decode(bytes,{maxOutputLength:128*1024*1024})).toString('utf8') : bytes.toString('utf8')
                if(!text.endsWith('\n'))throw new Error('Incomplete JSONL frame')
                for (const line of text.split('\n')) if (line) consume(line,cursor,now)
                cursor.offset+=end; pending=pending.subarray(end)
                await yieldLoop()
              }
              if (pending.length>MAX_FRAME) throw new Error('Incomplete frame size limit')
            }
            cursor.anchor=await anchor(cursor.offset)
          }
          cursor.size=info.size; cursor.mtime=info.mtimeMs; this.cursors.set(file,cursor)
          incomplete ||= cursor.warning
        } finally { await handle.close() }
      } catch { incomplete=true; /* Keep other sessions and the last successful cursor. */ }
    }
    return { records:[...this.cursors.values()].flatMap(c=>[...c.records.values()].filter(r=>r.at>=floor && r.at<=now)), incomplete }
  }
}
