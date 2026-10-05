import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {root,plugin,version,json,save,run,capture,copyPackage,hash} from './library.mjs'
import {releaseEntry,shouldPack,verifyNativePackage,validatePackedFiles} from './release-contract.mjs'
const entry=releaseEntry(await plugin(process.env.PLUGIN),process.env.PLUGIN)
const next=version(process.env.VERSION)
const directory=join(root,entry.directory)
run('npm',['version',next,'--no-git-tag-version','--ignore-scripts','--allow-same-version'],{cwd:directory})
if(Object.keys((await json(join(directory,'package.json'))).devDependencies ?? {}).length)run('npm',['ci','--ignore-scripts','--cache',join(root,'.cache/npm')],{cwd:directory})
run('npm',['run','check'],{cwd:directory})
const pkg=await json(join(directory,'package.json'))
if(pkg.name!==entry.name || pkg.version!==next || pkg.engines?.dsh!==entry.dshVersions.join(' || '))throw new Error('Unexpected release metadata')
if(!shouldPack(entry)){
  if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,'payload=false\n',{flag:'a'})
  console.log('Portable checks passed; native payload is produced only on macOS arm64')
  process.exit(0)
}
let nativeSha256
if(entry.nativeTarget){
  if(process.env.CI!=='true')throw new Error('Native release builds run only in CI')
  run('node',['scripts/build-sidecar.mjs'],{cwd:directory})
  await mkdir(join(directory,'tmp/api'),{recursive:true})
  await writeFile(join(directory,'tmp/api/package.json'),'{"private":true,"type":"module"}\n')
  run('npm',['install','--prefix','tmp/api','--ignore-scripts','--no-audit','--no-fund','--save-exact','@deepseek-ai/cordis@4.0.4','@deepseek-ai/dsh-host-webserver@0.2.0-rc.2','@deepseek-ai/dsh-client-connection@0.2.0-rc.2'],{cwd:directory})
  run('node',['test/ci-runtime.mjs'],{cwd:directory})
  run('node',['scripts/candidate.mjs'],{cwd:directory})
  nativeSha256=await verifyNativePackage(directory)
}
const output=join(root,'build/publish');await mkdir(output,{recursive:true})
await copyPackage(directory,join(output,'package-source'))
const packed=JSON.parse(capture('npm',['pack','--json','--ignore-scripts','--pack-destination',output,'./'+entry.directory]))
if(packed.length!==1)throw new Error('Expected exactly one packed plugin')
const archive=packed[0].filename
validatePackedFiles(packed[0].files,Boolean(entry.nativeTarget))
await save(join(output,'release.json'),{plugin:entry.name,version:next,entry,archive,sha256:await hash(join(output,archive)),nativeSha256,sourceCommit:capture('git',['rev-parse','HEAD']),baseMain:process.env.BASE_MAIN})
await writeFile(join(output,'SHA256SUMS'),`${await hash(join(output,archive))}  ${archive}\n`)
if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,`archive=${archive}\npayload=${Boolean(entry.nativeTarget) || process.platform==='linux'}\n`,{flag:'a'})
