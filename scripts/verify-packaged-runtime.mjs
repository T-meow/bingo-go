import { access, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { inspectBingo, sha256File } from './bingo-package-lib.mjs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const MAX_UNPACKED_BYTES = 320 * 1024 * 1024
const MAX_ASAR_BYTES = 15 * 1024 * 1024
const MAX_BUILTIN_GAMES_BYTES = 3 * 1024 * 1024
const MAX_BUILTIN_GAME_BYTES = 1024 * 1024
const ALLOWED_LOCALES = new Set(['en-US.pak', 'zh-CN.pak'])
const ALLOWED_ASAR_PACKAGES = new Set(['imurmurhash', 'pend', 'signal-exit', 'write-file-atomic', 'yauzl', 'zod'])

const root = resolve(import.meta.dirname, '..')
const release = process.env.BINGO_GO_RELEASE_DIR
  ? resolve(process.env.BINGO_GO_RELEASE_DIR)
  : join(root, 'release')
const target = `${process.platform}-${process.arch}`
const binaryName = process.platform === 'win32' ? 'bingo.exe' : 'bingo'

const packageRoot = process.platform === 'win32'
  ? join(release, 'win-unpacked')
  : process.platform === 'darwin'
    ? join(release, 'mac', 'Bingo Go.app')
    : join(release, 'linux-unpacked')
const resourcesDirectory = process.platform === 'darwin'
  ? join(packageRoot, 'Contents', 'Resources')
  : join(packageRoot, 'resources')
const executablePath = process.platform === 'win32'
  ? join(packageRoot, 'bingo-go.exe')
  : process.platform === 'darwin'
    ? join(packageRoot, 'Contents', 'MacOS', 'Bingo Go')
    : join(packageRoot, 'bingo-go')
const binaryPath = join(resourcesDirectory, 'bin', target, binaryName)
const asarPath = join(resourcesDirectory, 'app.asar')
const gamesDirectory = join(resourcesDirectory, 'game-packs')

await Promise.all([access(packageRoot), access(executablePath), access(binaryPath), access(asarPath), access(gamesDirectory)])

const inspection = inspectBingo(binaryPath)
const [packageSize, executableStats, binaryStats, asarStats] = await Promise.all([
  directorySize(packageRoot),
  stat(executablePath),
  stat(binaryPath),
  stat(asarPath)
])

if (packageSize.bytes > MAX_UNPACKED_BYTES) {
  throw new Error(`Unpacked package is ${formatMiB(packageSize.bytes)}, above the ${formatMiB(MAX_UNPACKED_BYTES)} limit.`)
}
if (asarStats.size > MAX_ASAR_BYTES) {
  throw new Error(`app.asar is ${formatMiB(asarStats.size)}, above the ${formatMiB(MAX_ASAR_BYTES)} limit.`)
}

const asarEntries = asar.listPackage(asarPath, { isPack: false })
const asarPackages = [...new Set(asarEntries.flatMap(packageNameFromAsarEntry))].sort()
const unexpectedPackages = asarPackages.filter((name) => !ALLOWED_ASAR_PACKAGES.has(name))
if (unexpectedPackages.length > 0) {
  throw new Error(`Unexpected production dependencies in app.asar: ${unexpectedPackages.join(', ')}`)
}

const builtinGames = []
let builtinGamesBytes = 0
for (const entry of (await readdir(gamesDirectory, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
  const size = await directorySize(join(gamesDirectory, entry.name))
  if (size.bytes > MAX_BUILTIN_GAME_BYTES) throw new Error(`Built-in game ${entry.name} is ${formatMiB(size.bytes)}, above the ${formatMiB(MAX_BUILTIN_GAME_BYTES)} limit.`)
  builtinGamesBytes += size.bytes
  builtinGames.push({ id: entry.name, files: size.files, bytes: size.bytes, kibibytes: Number((size.bytes / 1024).toFixed(1)) })
}
if (builtinGames.length !== 3) throw new Error(`Expected 3 built-in games, found ${builtinGames.length}.`)
if (builtinGamesBytes > MAX_BUILTIN_GAMES_BYTES) throw new Error(`Built-in games total ${formatMiB(builtinGamesBytes)}, above the ${formatMiB(MAX_BUILTIN_GAMES_BYTES)} limit.`)

const localesDirectory = process.platform === 'darwin'
  ? null
  : join(packageRoot, 'locales')
const locales = localesDirectory
  ? (await readdir(localesDirectory)).filter((name) => name.endsWith('.pak')).sort()
  : []
const unexpectedLocales = locales.filter((name) => !ALLOWED_LOCALES.has(name))
const missingLocales = localesDirectory
  ? [...ALLOWED_LOCALES].filter((name) => !locales.includes(name))
  : []
if (unexpectedLocales.length > 0 || missingLocales.length > 0) {
  throw new Error(`Electron locale set is invalid. Unexpected: ${unexpectedLocales.join(', ') || '<none>'}; missing: ${missingLocales.join(', ') || '<none>'}.`)
}

const packageExtensions = process.platform === 'win32'
  ? ['.exe']
  : process.platform === 'darwin'
    ? ['.dmg', '.zip']
    : ['.AppImage', '.deb']
const packages = (await readdir(release))
  .filter((file) => packageExtensions.some((extension) => file.endsWith(extension)))
  .sort()

console.log(JSON.stringify({
  packageRoot,
  target,
  files: packageSize.files,
  bytes: packageSize.bytes,
  mebibytes: Number((packageSize.bytes / 1024 / 1024).toFixed(2)),
  limits: {
    unpackedBytes: MAX_UNPACKED_BYTES,
    asarBytes: MAX_ASAR_BYTES,
    builtinGamesBytes: MAX_BUILTIN_GAMES_BYTES,
    builtinGameBytes: MAX_BUILTIN_GAME_BYTES
  },
  executable: {
    path: executablePath,
    bytes: executableStats.size,
    sha256: await sha256File(executablePath)
  },
  asar: {
    path: asarPath,
    bytes: asarStats.size,
    sha256: await sha256File(asarPath),
    productionPackages: asarPackages
  },
  runtime: {
    path: binaryPath,
    bytes: binaryStats.size,
    sha256: await sha256File(binaryPath),
    ...inspection
  },
  builtinGames,
  builtinGamesBytes,
  locales,
  packages
}, null, 2))

function packageNameFromAsarEntry(entry) {
  const parts = entry.replace(/^[/\\]+/, '').split(/[/\\]/)
  if (parts[0] !== 'node_modules' || !parts[1]) return []
  return [parts[1].startsWith('@') && parts[2] ? `${parts[1]}/${parts[2]}` : parts[1]]
}

async function directorySize(directory) {
  const pending = [directory]
  let bytes = 0
  let files = 0
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) {
        bytes += (await stat(path)).size
        files += 1
      }
    }
  }
  return { bytes, files }
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
