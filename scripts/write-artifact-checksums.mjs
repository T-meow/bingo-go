import { readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { sha256File } from './bingo-package-lib.mjs'

const release = process.env.BINGO_GO_RELEASE_DIR
  ? resolve(process.env.BINGO_GO_RELEASE_DIR)
  : resolve(import.meta.dirname, '..', 'release')
const extensions = ['.exe', '.dmg', '.zip', '.AppImage', '.deb']
const files = (await readdir(release))
  .filter((file) => extensions.some((extension) => file.endsWith(extension)))
  .sort()
if (files.length === 0) throw new Error(`No release packages found in ${release}.`)

const lines = []
for (const file of files) lines.push(`${await sha256File(join(release, file))}  ${file}`)
const destination = join(release, `SHA256SUMS-${process.platform}-${process.arch}.txt`)
await writeFile(destination, `${lines.join('\n')}\n`, 'utf8')
console.log(destination)
