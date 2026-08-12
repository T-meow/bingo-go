import { access, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { inspectBingo, sha256File } from './bingo-package-lib.mjs'

const root = resolve(import.meta.dirname, '..')
const release = process.env.BINGO_GO_RELEASE_DIR
  ? resolve(process.env.BINGO_GO_RELEASE_DIR)
  : join(root, 'release')
const target = `${process.platform}-${process.arch}`
const binaryName = process.platform === 'win32' ? 'bingo.exe' : 'bingo'
const resourcesDirectory = process.platform === 'win32'
  ? join(release, 'win-unpacked', 'resources')
  : process.platform === 'darwin'
    ? join(release, 'mac', 'Bingo Go.app', 'Contents', 'Resources')
    : join(release, 'linux-unpacked', 'resources')
const binaryPath = join(resourcesDirectory, 'bin', target, binaryName)

await access(binaryPath)
const inspection = inspectBingo(binaryPath)
const extensions = process.platform === 'win32'
  ? ['.exe']
  : process.platform === 'darwin'
    ? ['.dmg', '.zip']
    : ['.AppImage', '.deb']
const files = (await readdir(release)).filter((file) => extensions.some((extension) => file.endsWith(extension)))
for (const extension of extensions) {
  if (!files.some((file) => file.endsWith(extension))) {
    throw new Error(`Missing ${extension} package in ${release}.`)
  }
}

console.log(JSON.stringify({
  binaryPath,
  sha256: await sha256File(binaryPath),
  packages: files.sort(),
  ...inspection
}, null, 2))
