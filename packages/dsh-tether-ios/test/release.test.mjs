import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { releaseEntry } from '../../../scripts/release-contract.mjs'
test('pending-device metadata still blocks publication before any mutation', async () => {
  const registry=JSON.parse(await readFile(new URL('../../../plugins.json',import.meta.url),'utf8'))
  const entry=registry.plugins.find(p=>p.name==='dsh-tether-ios')
  assert.throws(()=>releaseEntry({...entry,releaseReady:false},entry.name),/publishing is disabled/)
})
