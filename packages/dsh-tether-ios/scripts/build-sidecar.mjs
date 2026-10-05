import { mkdir, copyFile, chmod, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Build on a macOS arm64 CI runner')
const root = fileURLToPath(new URL('../', import.meta.url))
const target = root + 'native/target'
for (const args of [
  ['test', '--release', '--manifest-path', root + 'native/Cargo.toml', '--locked', '--target', 'aarch64-apple-darwin'],
  ['build', '--manifest-path', root + 'native/Cargo.toml', '--locked', '--release', '--target', 'aarch64-apple-darwin', '-p', 'tether-host'],
]) {
  const result = spawnSync('cargo', args, { stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: target } })
  if (result.status !== 0) throw new Error('Native build/test failed')
}
const dir = root + 'bin/darwin-arm64'
await mkdir(dir, { recursive: true })
await copyFile(target + '/aarch64-apple-darwin/release/tether-host', dir + '/tether-host')
await chmod(dir + '/tether-host', 0o755)
const sum = createHash('sha256').update(await readFile(dir + '/tether-host')).digest('hex')
await writeFile(dir + '/SHA256SUMS', sum + '  tether-host\n')
