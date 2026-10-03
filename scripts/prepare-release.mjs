import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {root,plugin,version,json,save,run,capture,copyPackage,hash} from './library.mjs'
const entry=await plugin(process.env.PLUGIN)
const next=version(process.env.VERSION)
const directory=join(root,entry.directory)
run('npm',['version',next,'--no-git-tag-version','--ignore-scripts','--allow-same-version'],{cwd:directory})
run('npm',['ci','--ignore-scripts','--cache',join(root,'.cache/npm')],{cwd:directory})
run('npm',['run','check'],{cwd:directory})
const pkg=await json(join(directory,'package.json'))
if(pkg.name!==entry.name || pkg.version!==next || pkg.engines?.dsh!==entry.dshVersions.join(' || '))throw new Error('Unexpected release metadata')
const output=join(root,'build/publish');await mkdir(output,{recursive:true})
await copyPackage(directory,join(output,'package-source'))
const packed=JSON.parse(capture('npm',['pack','--json','--ignore-scripts','--pack-destination',output,'./'+entry.directory]))
if(packed.length!==1)throw new Error('Expected exactly one packed plugin')
const archive=packed[0].filename
const allowed=['lib/','cordis.patch.yml','package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md']
for(const file of packed[0].files)if(!allowed.some(p=>file.path===p || p.endsWith('/') && file.path.startsWith(p)))throw new Error('Unexpected packed file '+file.path)
if(packed[0].files.some(f=>f.path.startsWith('node_modules/')))throw new Error('Unexpected dependencies')
await save(join(output,'release.json'),{plugin:entry.name,version:next,entry,archive,sha256:await hash(join(output,archive)),sourceCommit:capture('git',['rev-parse','HEAD']),baseMain:process.env.BASE_MAIN})
await writeFile(join(output,'SHA256SUMS'),`${await hash(join(output,archive))}  ${archive}\n`)
if(process.env.GITHUB_OUTPUT)await writeFile(process.env.GITHUB_OUTPUT,`archive=${archive}\n`,{flag:'a'})
