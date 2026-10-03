import { join } from 'node:path'
import { registry, root, run, validatePackage } from './library.mjs'

const major = Number(process.versions.node.split('.')[0])
if (major < 24) throw new Error('Cloud development requires Node.js 24 or later')

const { plugins } = await registry()
for (const entry of plugins) {
  await validatePackage(entry)
  run('npm', ['ci', '--prefix', entry.directory, '--ignore-scripts', '--cache', join(root, '.cache/npm')])
}
console.log(`Prepared ${plugins.length} plugin package(s); run node scripts/check.mjs for validation.`)
