import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {resolve,join,basename} from 'node:path'
import {createHash} from 'node:crypto'
export const root=resolve(import.meta.dirname,'..')
export const json=async(path)=>JSON.parse(await readFile(path,'utf8'))
export const save=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n')
export const run=(command,args,options={})=>{
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,npm_config_cache:join(root,'.cache/npm')},...options})
  if(result.error)throw result.error
  if(result.status!==0)throw new Error(`${command} failed (${result.status ?? result.signal})`)
  return result
}
export const capture=(command,args)=>{
  const result=run(command,args,{stdio:['ignore','pipe','inherit'],encoding:'utf8'})
  return result.stdout.trim()
}
export const registry=()=>json(join(root,'plugins.json'))
export async function plugin(name){
  if(!/^[a-z0-9][a-z0-9-]*$/.test(name ?? ''))throw new Error('Invalid plugin name')
  const list=await registry();const entry=list.plugins.find(p=>p.name===name)
  if(!entry || entry.directory!==`packages/${name}`)throw new Error('Unknown plugin directory')
  return entry
}
export function version(value){
  if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value ?? ''))throw new Error('Version must be stable major.minor.patch')
  return value
}
export const hash=async(path)=>createHash('sha256').update(await readFile(path)).digest('hex')
export async function copyPackage(source,target){
  await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true})
  await cp(source,target,{recursive:true,filter:path=>!['node_modules','.cache','.git','build','target','tmp'].includes(basename(path)) && !path.endsWith('.tgz')})
}
export async function validatePackage(entry){
  const pkg=await json(join(root,entry.directory,'package.json'))
  if(pkg.name!==entry.name || pkg.version!==entry.version)throw new Error('Registry and package identity/version differ')
  const required=entry.dshVersions
  if(!Array.isArray(required)||required.length===0)throw new Error('Missing tested DSH versions')
  if(pkg.engines?.dsh!==required.join(' || ') || pkg.dsh?.compatibility?.dsh!==required.join(' || '))throw new Error('DSH version declarations differ')
  for(const v of required)if(pkg.dsh.compatibility.dshReleases?.[v]!=='compatible')throw new Error('Missing tested compatibility declaration')
  if(pkg.dsh?.bundle?.patch!=='./cordis.patch.yml')throw new Error('Missing bundle patch')
  if(pkg.scripts?.prepare || pkg.scripts?.install || pkg.scripts?.postinstall)throw new Error('Prebuilt plugins must not run install scripts')
  if(Object.keys(pkg.dependencies ?? {}).length)throw new Error('Runtime dependencies must be bundled or explicitly reviewed')
  const files=[pkg.main,pkg.exports?.['./client'],'cordis.patch.yml','LICENSE'].filter(Boolean)
  for(const file of files){
    if(typeof file!=='string' || file.includes('..') || file.startsWith('/'))throw new Error('Invalid package entry path')
    await readFile(join(root,entry.directory,file))
  }
  return pkg
}
