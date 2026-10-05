import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
const root = fileURLToPath(new URL('../../../', import.meta.url))
test('pending-device package cannot invoke release preparation', async () => {
  const result = spawnSync(process.execPath, [root + 'scripts/prepare-release.mjs'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PLUGIN: 'dsh-tether-ios', VERSION: '0.1.0' },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /publishing is disabled/)
  const manifest = JSON.parse(await readFile(root + 'packages/dsh-tether-ios/package.json', 'utf8'))
  assert.deepEqual(manifest.dsh.compatibility.dshReleases, {})
})
