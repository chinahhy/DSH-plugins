import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const base = new URL('../bin/darwin-arm64/', import.meta.url)
const bytes = await readFile(new URL('tether-host', base))
// Mach-O 64-bit little-endian header and CPU_TYPE_ARM64, not a mislabeled Intel executable.
if (bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== 0x0100000c) throw new Error('Expected arm64 Mach-O')
if (!((await stat(new URL('tether-host', base))).mode & 0o111)) throw new Error('Missing executable bit')
const checksum = createHash('sha256').update(bytes).digest('hex')
if ((await readFile(new URL('SHA256SUMS', base), 'utf8')).split(' ')[0] !== checksum) throw new Error('Sidecar checksum mismatch')
console.log('Verified executable arm64 Mach-O and SHA256.')
