import { readFile, writeFile, readdir, copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
if (process.env.CI !== 'true') throw new Error('Candidate packaging runs only in CI')
const root = fileURLToPath(new URL('../', import.meta.url))
const out = fileURLToPath(new URL('../../../build/tether-candidate/', import.meta.url))
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`)
  return result.stdout
}
const metadata = JSON.parse(run('cargo', ['metadata', '--manifest-path', 'native/Cargo.toml', '--locked', '--format-version', '1', '--filter-platform', 'aarch64-apple-darwin']))
const licenses = []
const licenseTexts = new Map()
for (const pkg of metadata.packages.sort((a, b) => a.name.localeCompare(b.name))) {
  licenses.push(`${pkg.name} ${pkg.version}\nSPDX: ${pkg.license ?? 'see license file'}\nSource: ${pkg.repository ?? pkg.source ?? 'vendored in this package'}`)
  const dir = dirname(pkg.manifest_path)
  const files = (await readdir(dir)).filter(name => /^(licen[cs]e|copying|notice)([-_.]|$)/i.test(name))
  if (pkg.license_file && !files.includes(pkg.license_file)) files.push(pkg.license_file)
  let found = false
  for (const name of files) {
    try { const text = await readFile(join(dir, name), 'utf8'); licenses.push(`${name}\n${text}`); found = true } catch (error) { if (error.code !== 'EISDIR') throw error }
  }
  // Some crates omit license texts. Include the pinned official SPDX templates.
  if (!found) {
    if (!pkg.license) throw new Error(`No license for ${pkg.name}`)
    for (const id of pkg.license.split(/\s+|\(|\)|\//).filter(id => id && !['AND', 'OR', 'WITH'].includes(id))) {
      if (!licenseTexts.has(id)) {
        const response = await fetch(`https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/${id}.txt`)
        if (!response.ok) throw new Error(`Missing SPDX text ${id}`)
        licenseTexts.set(id, await response.text())
      }
      licenses.push(`SPDX template ${id}\n${licenseTexts.get(id)}`)
    }
  }
}
await writeFile(root + 'bin/darwin-arm64/THIRD_PARTY_LICENSES.txt', licenses.join('\n\n---\n\n'))
await mkdir(out, { recursive: true })
const packed = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', out]))[0]
const required = ['bin/darwin-arm64/tether-host', 'bin/darwin-arm64/SHA256SUMS', 'bin/darwin-arm64/THIRD_PARTY_LICENSES.txt', 'lib/index.js', 'lib/client.js', 'cordis.patch.yml']
for (const file of required) if (!packed.files.some(entry => entry.path === file)) throw new Error('Missing packed file: ' + file)
for (const file of packed.files) if (!/^(lib\/|bin\/darwin-arm64\/|package.json$|cordis.patch.yml$|README.md$|LICENSE$|THIRD_PARTY_NOTICES.md$)/.test(file.path)) throw new Error('Unexpected packed file: ' + file.path)
const hash = createHash('sha256').update(await readFile(join(out, packed.filename))).digest('hex')
await writeFile(join(out, 'SHA256SUMS'), `${hash}  ${packed.filename}\n`)
await copyFile(root + 'docs/api-evidence.json', join(out, 'api-evidence.json'))
await copyFile(root + 'native/Cargo.lock', join(out, 'Cargo.lock'))
await writeFile(join(out, 'candidate.json'), JSON.stringify({
  sourceCommit: process.env.GITHUB_SHA, artifact: packed.filename, sha256: hash,
  target: 'darwin-arm64', dshTarget: '0.2.0-rc.2',
  iosSource: '0c10375d5d1931bd8603f203c494e621dd5040a6',
  checks: ['node tests', 'cargo test --locked', 'arm64 Mach-O', 'real DSH API lifecycle', 'parent stdin EOF'],
  realDeviceValidated: false, published: false,
}, null, 2) + '\n')
console.log(`Candidate archive verified: ${packed.filename}`)
