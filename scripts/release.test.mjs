import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,writeFile,rm,access,chmod} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {root,copyPackage} from './library.mjs'
import {releaseEntry,shouldPack,verifyNativePackage,validatePackedFiles} from './release-contract.mjs'
const entry={name:'fixture',directory:'packages/fixture',marketEntry:'chinahhy__DSH-plugins--packages-fixture.yml',dshVersions:['0.2.0-rc.2'],nativeTarget:'darwin-arm64'}
test('only validated identities and supported native platforms can publish',()=>{
 assert.throws(()=>releaseEntry({...entry,releaseReady:false},'fixture'),/publishing is disabled/)
 assert.throws(()=>releaseEntry({...entry,directory:'../escape'},'fixture'),/Invalid/)
 assert.throws(()=>releaseEntry({...entry,dshVersions:[]},'fixture'),/publishing is disabled/)
 assert.throws(()=>releaseEntry({...entry,nativeTarget:'linux-x64'},'fixture'),/Unsupported/)
 assert.equal(shouldPack(entry,'linux','x64'),false);assert.equal(shouldPack(entry,'darwin','x64'),false);assert.equal(shouldPack(entry,'darwin','arm64'),true)
 assert.equal(shouldPack({...entry,nativeTarget:undefined},'linux','x64'),true)
})
test('archives reject missing native files and installation-time payloads',()=>{
 const files=['lib/index.js','cordis.patch.yml','package.json','README.md','LICENSE'].map(path=>({path}))
 validatePackedFiles(files,false)
 assert.throws(()=>validatePackedFiles(files,true),/Missing/)
 assert.throws(()=>validatePackedFiles([...files,{path:'node_modules/leak'}],false),/Unexpected/)
 assert.throws(()=>validatePackedFiles([...files,{path:'lib/../secret'}],false),/Unexpected/)
})
test('promotion excludes build caches and synthetic runtime credentials',async()=>{
 await mkdir(join(root,'tmp'),{recursive:true});const base=await mkdtemp(join(root,'tmp/release-fixture-'))
 try{
  const source=join(base,'source'),dest=join(base,'out')
  for(const name of ['native/target','tmp/api','bin/darwin-arm64'])await mkdir(join(source,name),{recursive:true})
  await writeFile(join(source,'native/target/large'),'cache');await writeFile(join(source,'tmp/api/credentials'),'synthetic');await writeFile(join(source,'bin/darwin-arm64/tether-host'),'invalid')
  await copyPackage(source,dest);await assert.rejects(access(join(dest,'tmp')));await assert.rejects(access(join(dest,'native/target')))
  await assert.rejects(verifyNativePackage(dest),/arm64 Mach-O/)
  const binary=join(dest,'bin/darwin-arm64/tether-host'),bytes=Buffer.alloc(16);bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(0x100000c,4)
  await writeFile(binary,bytes);await chmod(binary,0o755)
  const sha=createHash('sha256').update(bytes).digest('hex')
  await writeFile(join(dest,'bin/darwin-arm64/SHA256SUMS'),sha+'  tether-host\n')
  await writeFile(join(dest,'bin/darwin-arm64/THIRD_PARTY_LICENSES.txt'),'fixture license '.repeat(10))
  assert.equal(await verifyNativePackage(dest),sha)
  bytes[8]=1;await writeFile(binary,bytes);await assert.rejects(verifyNativePackage(dest),/checksum mismatch/)
 }finally{await rm(base,{recursive:true,force:true})}
})
