import {mkdir,mkdtemp} from 'node:fs/promises'
import {resolve,join} from 'node:path'
export async function projectTemp(prefix:string){
  const root=resolve(import.meta.dirname,'../../../.cache/test-tmp')
  await mkdir(root,{recursive:true})
  return mkdtemp(join(root,prefix))
}
