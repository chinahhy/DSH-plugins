import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
await mkdir(new URL('lib/', root), { recursive: true })
for (const file of ['index.js', 'routes.js', 'sidecar.js', 'relay.js', 'client.js']) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('src/' + file, root))], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`Syntax check failed: ${file}`)
  if (file !== 'client.js') await copyFile(new URL('src/' + file, root), new URL('lib/' + file, root))
}
const client = await readFile(new URL('src/client.js', root), 'utf8')
await writeFile(new URL('lib/client.js', root), `window.__ModuleLoader__.load({id:"dsh-tether-ios",factory:(require)=>{const exports={};\n${client}\nreturn exports;}});\n`)
console.log('Built host ESM and DSH ModuleLoader client (no runtime dependencies).')
