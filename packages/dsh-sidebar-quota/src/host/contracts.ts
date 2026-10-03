import type { IncomingMessage, ServerResponse } from 'node:http'
export interface Credentials {
  resolve(ref: string): Promise<{ value: string } | undefined>
  readRecord(key: string): Promise<unknown>
}
export interface WebServer {
  readonly port: number | null
  register(route: { kind: 'exact'; path: string; handler(req: IncomingMessage, res: ServerResponse): void | Promise<void> }): () => void
}
/** Narrow structural contracts checked against the installed 0.2.0-rc.2 runtime. */
export interface Context {
  get(name: 'credentials'): Credentials | undefined
  get(name: 'webServer'): WebServer | undefined
  get(name: string): any
  effect(callback: () => (() => void) | void, label?: string): unknown
  on(name: string, callback: (...args: any[]) => void, options?: { global?: boolean }): () => void
  inject(names: string[], callback: (ctx: Context) => void): unknown
}
