import { readFile, readdir, rm } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const release = join(root, 'release')
const packageMetadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const packageVersion = packageMetadata.version

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await resetPackageOutput()

async function resetPackageOutput() {
  assertReleaseRoot(release)
  let entries
  try {
    entries = await readdir(release, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log(JSON.stringify({ release, removed: false, reason: 'release directory does not exist' }, null, 2))
      return
    }
    throw error
  }

  const unknown = entries.filter((entry) => !isKnownPackageOutput(entry, packageVersion)).map((entry) => entry.name)
  if (unknown.length > 0) {
    throw new Error(`Refusing to remove unknown release entries: ${unknown.join(', ')}`)
  }

  for (const entry of entries) {
    await rm(join(release, entry.name), { recursive: entry.isDirectory(), force: false })
  }

  console.log(JSON.stringify({
    release,
    removed: entries.length > 0,
    entries: entries.map((entry) => entry.name)
  }, null, 2))
}

export function isKnownPackageOutput(entry, version) {
  if (entry.isDirectory()) return ['win-unpacked', 'linux-unpacked', 'mac'].includes(entry.name)
  if (!entry.isFile()) return false
  return entry.name === 'builder-debug.yml'
    || entry.name === 'builder-effective-config.yaml'
    || /^latest(?:-mac|-linux)?\.ya?ml$/i.test(entry.name)
    || /^SHA256SUMS-(?:win32|darwin|linux)-x64\.txt$/i.test(entry.name)
    || new RegExp(`^Bingo-Go-${escapeRegExp(version)}-(?:win|mac|linux)-x64\\.(?:exe|dmg|zip|AppImage|deb)(?:\\.blockmap)?$`, 'i').test(entry.name)
}

function assertReleaseRoot(path) {
  const child = relative(root, path)
  if (child !== 'release' || resolve(root, child) !== path) {
    throw new Error(`Package output path must be the project release directory: ${path}`)
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
