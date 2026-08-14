import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'vite'

const root = resolve(import.meta.dirname, '..')
const outputRoot = join(root, 'games', 'build')
const packages = [
  { source: 'bingo', id: 'io.github.tmeow.bingogo.bingo' },
  { source: 'sudoku', id: 'io.github.tmeow.bingogo.sudoku' },
  { source: 'snake', id: 'io.github.tmeow.bingogo.snake' }
]

await mkdir(outputRoot, { recursive: true })
let totalBytes = 0
for (const item of packages) {
  const source = join(root, 'games', item.source)
  const destination = join(outputRoot, item.id)
  await rm(destination, { recursive: true, force: true })
  await build({
    root: source,
    base: './',
    logLevel: 'warn',
    build: {
      outDir: destination,
      emptyOutDir: true,
      target: 'chrome134',
      minify: 'esbuild',
      modulePreload: { polyfill: false },
      cssCodeSplit: false,
      rollupOptions: { output: { manualChunks: undefined } }
    }
  })
  await cp(join(source, 'manifest.json'), join(destination, 'manifest.json'))
  const size = await directorySize(destination)
  if (size > 1024 * 1024) throw new Error(`${item.id} is ${formatKiB(size)}, above the 1 MiB built-in game limit.`)
  totalBytes += size
  console.log(`${item.id}: ${formatKiB(size)}`)
}
if (totalBytes > 3 * 1024 * 1024) throw new Error(`Built-in games total ${formatKiB(totalBytes)}, above the 3 MiB limit.`)
console.log(`total: ${formatKiB(totalBytes)}`)

async function directorySize(directory) {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    total += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size
  }
  return total
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}
