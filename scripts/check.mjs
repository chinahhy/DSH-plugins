import {registry,validatePackage,run,root} from './library.mjs'
import {join} from 'node:path'
const {plugins}=await registry()
for(const entry of plugins){
  const pkg=await validatePackage(entry)
  if(Object.keys(pkg.devDependencies ?? {}).length)run('npm',['ci','--prefix',entry.directory,'--ignore-scripts','--cache',join(root,'.cache/npm')])
  run('npm',['run','check','--prefix',entry.directory])
  await validatePackage(entry)
}
run('node',['scripts/readme.mjs','--check'])
