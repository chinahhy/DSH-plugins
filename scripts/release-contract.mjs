import {readFile,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
export function releaseEntry(entry,name){
  if(!/^[a-z0-9][a-z0-9-]*$/.test(name ?? '') || entry?.name!==name || entry.directory!==`packages/${name}` || entry.marketEntry!==`chinahhy__DSH-plugins--packages-${name}.yml`)throw new Error('Invalid release entry')
  if(entry.releaseReady===false || !Array.isArray(entry.dshVersions) || !entry.dshVersions.length)throw new Error('Plugin awaits real-device validation; publishing is disabled')
  if(entry.nativeTarget && entry.nativeTarget!=='darwin-arm64')throw new Error('Unsupported native release target')
  return entry
}
export const shouldPack=(entry,platform=process.platform,arch=process.arch)=>!entry.nativeTarget || platform==='darwin' && arch==='arm64'
export async function verifyNativePackage(directory){
  const base=join(directory,'bin/darwin-arm64');const bytes=await readFile(join(base,'tether-host'))
  if(bytes.length<8 || bytes.readUInt32LE(0)!==0xfeedfacf || bytes.readUInt32LE(4)!==0x100000c)throw new Error('Expected arm64 Mach-O')
  if(!((await stat(join(base,'tether-host'))).mode & 0o111))throw new Error('Native host is not executable')
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const sums=(await readFile(join(base,'SHA256SUMS'),'utf8')).trim().split(/\s+/)
  if(sums[0]!==sha256 || sums[1]!=='tether-host')throw new Error('Native host checksum mismatch')
  if((await readFile(join(base,'THIRD_PARTY_LICENSES.txt'),'utf8')).length<100)throw new Error('Missing native license inventory')
  return sha256
}
export function validatePackedFiles(files,native){
  const allowed=['lib/','docs/','cordis.patch.yml','package.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md',...(native?['bin/darwin-arm64/']:[])]
  for(const f of files)if(f.path.split('/').includes('..') || !allowed.some(p=>f.path===p || p.endsWith('/') && f.path.startsWith(p)))throw new Error('Unexpected packed file '+f.path)
  const required=['lib/index.js','cordis.patch.yml','package.json','README.md','LICENSE',...(native?['bin/darwin-arm64/tether-host','bin/darwin-arm64/SHA256SUMS','bin/darwin-arm64/THIRD_PARTY_LICENSES.txt']:[])]
  for(const path of required)if(!files.some(f=>f.path===path))throw new Error('Missing packed file '+path)
}
