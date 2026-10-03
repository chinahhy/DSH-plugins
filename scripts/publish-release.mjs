import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {root,plugin,version,json,registry,save,run,capture,copyPackage,hash,validatePackage} from './library.mjs'
const entry=await plugin(process.env.PLUGIN);const next=version(process.env.VERSION)
const payload=join(root,'build/publish');const meta=await json(join(payload,'release.json'))
if(meta.plugin!==entry.name || meta.version!==next || meta.entry?.name!==entry.name || meta.entry?.directory!==entry.directory || meta.entry?.marketEntry!==entry.marketEntry || !/^[a-z0-9.-]+\.tgz$/.test(meta.archive))throw new Error('Artifact identity mismatch')
if(await hash(join(payload,meta.archive))!==meta.sha256)throw new Error('Artifact checksum mismatch')
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0}
const tag=`${entry.name}-v${next}`
const old=version(entry.version)
if(compare(next,old)<0 || compare(next,old)===0 && entry.releaseTag!==null && entry.releaseTag!==tag)throw new Error('Version must increase')
if(capture('git',['rev-parse','HEAD'])!==meta.baseMain)throw new Error('main changed while building; rerun on the current main')
await copyPackage(join(payload,'package-source'),join(root,entry.directory))
const list=await registry();const row=list.plugins.find(p=>p.name===entry.name)
Object.assign(row,meta.entry,{version:next,releaseTag:tag});await save(join(root,'plugins.json'),list)
await validatePackage(row);run('node',['scripts/readme.mjs'])
run('git',['add','--',entry.directory,'plugins.json','README.md'])
const changes=capture('git',['diff','--cached','--name-only'])
let commit
if(changes){
  run('git',['commit','-m',`release: ${entry.name} ${next}`]);commit=capture('git',['rev-parse','HEAD'])
  run('git',['tag',tag,commit])
  run('git',['push','--atomic','origin','HEAD:main',`refs/tags/${tag}`])
}else{
  commit=capture('git',['rev-parse',`refs/tags/${tag}`])
  if(commit!==capture('git',['rev-parse','HEAD']))throw new Error('Retry tag no longer matches main')
}
const notes=join(payload,'release-notes.md')
await writeFile(notes,`## ${entry.name} ${next}\n\n已验证 DSH：${row.dshVersions.join('、')}；Node.js 24+。\n\nActions 已在 Linux、macOS 完成类型检查、单元测试和构建；测试数量以本次运行输出为准。源码提交 ${commit}；开发来源 ${meta.sourceCommit}。\n\n市场安装源使用 GitHub 子目录。当前使用本地 link/file 的安装需要一次性切换来源。Release 包用于手动下载和回退。\n\nSHA-256：${meta.sha256}\n`)
const found=run('gh',['release','list','--repo','chinahhy/DSH-plugins','--json','tagName','--limit','100'],{stdio:['ignore','pipe','inherit'],encoding:'utf8'})
if(JSON.parse(found.stdout).some(r=>r.tagName===tag)){
  // An existing version is immutable; never overwrite its assets on retry.
  run('gh',['release','download',tag,'--repo','chinahhy/DSH-plugins','--pattern',meta.archive,'--dir',join(root,'build/existing')])
  if(await hash(join(root,'build/existing',meta.archive))!==meta.sha256)throw new Error('Existing release asset differs; bump version')
}else run('gh',['release','create',tag,join(payload,meta.archive),join(payload,'SHA256SUMS'),'--repo','chinahhy/DSH-plugins','--verify-tag','--title',`${entry.name} ${next}`,'--notes-file',notes])
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,`Published [${tag}](https://github.com/chinahhy/DSH-plugins/releases/tag/${tag}).\n\nMarketplace listing and local installation-source migration are separate steps.\n`,{flag:'a'})
