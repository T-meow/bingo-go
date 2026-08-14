import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const guiDirectory = path.join(root, 'src', 'renderer', 'public', 'avatars')
const coreDirectory = path.resolve(process.argv[2] ?? path.join(root, '..', 'bingo', 'assets', 'avatars'))
const ids = Array.from({ length: 12 }, (_, index) => `identicon-${String(index + 1).padStart(2, '0')}`)

for (const id of ids) {
  const [gui, core] = await Promise.all([
    readFile(path.join(guiDirectory, `${id}.png`)),
    readFile(path.join(coreDirectory, `${id}.png`))
  ])
  const guiHash = createHash('sha256').update(gui).digest('hex')
  const coreHash = createHash('sha256').update(core).digest('hex')
  if (guiHash !== coreHash) throw new Error(`${id} differs between Bingo Go and Bingo`)
  if (gui.readUInt32BE(16) !== 256 || gui.readUInt32BE(20) !== 256) throw new Error(`${id} must be 256x256`)
}

console.log(`Verified ${ids.length} synchronized 256x256 identicons.`)
