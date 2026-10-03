import { build } from 'esbuild'
import { mkdir,writeFile,readFile } from 'node:fs/promises'
import {join} from 'node:path'
await mkdir('lib',{recursive:true})
const host=await build({entryPoints:['src/index.ts'],outfile:'lib/index.js',bundle:true,format:'esm',platform:'node',target:'node24',minify:true,metafile:true,legalComments:'inline'})
const vendors=new Set(Object.keys(host.metafile.inputs).map(path=>path.match(/^node_modules\/([^/]+)\//)?.[1]).filter(Boolean))
const licenses=[]
for(const vendor of [...vendors].sort()) {
  let license
  for(const name of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT.txt'])try{license=await readFile(join('node_modules',vendor,name),'utf8');break}catch{}
  if(!license)try{license=await readFile(join('vendor-licenses',`${vendor}.txt`),'utf8')}catch{}
  if(!license)throw new Error(`License not found for ${vendor}`)
  licenses.push(`=== ${vendor} ===\n${license}`)
}
await writeFile('lib/VENDOR_LICENSES.txt',licenses.join('\n\n'))
const client=await build({entryPoints:['src/client/index.tsx'],bundle:true,write:false,format:'cjs',platform:'browser',target:'es2022',external:['react','react/jsx-runtime'],loader:{'.css':'text'},legalComments:'inline'})
const wrapper=`window.__ModuleLoader__.load({id:"dsh-sidebar-quota",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`
await writeFile('lib/client.js',wrapper)
console.log('DSH host ESM and client ModuleLoader bundles built')
