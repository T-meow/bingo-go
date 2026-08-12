import { chmod, copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectBingo, sha256File } from './bingo-package-lib.mjs'

const supportedTargets = new Set(['win32-x64', 'darwin-x64', 'linux-x64'])
const target = `${process.platform}-${process.arch}`
if (!supportedTargets.has(target)) {
  throw new Error(`Unsupported package target: ${target}. Expected an x64 Windows, macOS, or Linux runner.`)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binaryName = process.platform === 'win32' ? 'bingo.exe' : 'bingo'
const override = process.env.BINGO_GUI_BUNDLE_BINARY
if (override && !isAbsolute(override)) {
  throw new Error(`BINGO_GUI_BUNDLE_BINARY must be an absolute path: ${override}`)
}
const source = resolve(override || join(root, '..', 'bingo', 'target', 'release', binaryName))
const destination = join(root, 'resources', 'bin', target, binaryName)

const sourceStats = await stat(source)
if (!sourceStats.isFile() || sourceStats.size === 0) {
  throw new Error(`The release Bingo executable is missing or empty: ${source}`)
}
const inspection = inspectBingo(source)

await mkdir(dirname(destination), { recursive: true })
await copyFile(source, destination)
if (process.platform !== 'win32') await chmod(destination, 0o755)

const [sourceHash, destinationHash] = await Promise.all([
  sha256File(source),
  sha256File(destination)
])
if (sourceHash !== destinationHash) {
  throw new Error('The bundled Bingo executable failed SHA-256 verification.')
}

console.log(JSON.stringify({
  source,
  destination,
  target,
  bytes: sourceStats.size,
  sha256: destinationHash,
  ...inspection
}, null, 2))
