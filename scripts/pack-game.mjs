import { createWriteStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, stat, unlink } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import yazl from 'yazl'

const root = resolve(import.meta.dirname, '..')
const LIMITS = { archive: 10 * 1024 * 1024, extracted: 25 * 1024 * 1024, entries: 256, file: 8 * 1024 * 1024, manifest: 64 * 1024, icon: 256 * 1024 }
if (!process.argv[2]) throw new Error('Usage: npm run pack:game -- <game-directory> [output.bingo-pack]')
const source = resolve(process.argv[2])
const files = await collectFiles(source)
const manifestFile = files.find((file) => file.path === 'manifest.json')
if (!manifestFile) throw new Error('manifest.json must exist at the package root.')
if (manifestFile.bytes > LIMITS.manifest) throw new Error('manifest.json exceeds 64 KiB.')
const manifest = validateManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(manifestFile.absolute))))
const names = new Set(files.map((file) => file.path))
if (!names.has(manifest.entry)) throw new Error(`Entry file "${manifest.entry}" is missing.`)
if (manifest.icon) {
  const icon = files.find((file) => file.path === manifest.icon)
  if (!icon) throw new Error(`Icon file "${manifest.icon}" is missing.`)
  if (icon.bytes > LIMITS.icon) throw new Error('Icon exceeds 256 KiB.')
  assertIconBytes(manifest.icon, await readFile(icon.absolute))
}

const output = resolve(process.argv[3] ?? join(root, 'games', 'dist', `${manifest.id}-${manifest.version}.bingo-pack`))
if (output === source || output.startsWith(`${source}${sep}`)) throw new Error('Output must be outside the game source directory.')
await mkdir(dirname(output), { recursive: true })
const zip = new yazl.ZipFile()
for (const file of files) zip.addFile(file.absolute, file.path, { compress: true, mode: 0o100644 })
let outputCreated = false
try {
  await new Promise((resolvePromise, reject) => {
    const stream = createWriteStream(output, { mode: 0o600, flags: 'wx' })
    stream.on('open', () => { outputCreated = true })
    stream.on('close', resolvePromise); stream.on('error', reject); zip.outputStream.on('error', reject); zip.outputStream.pipe(stream); zip.end()
  })
} catch (error) {
  if (outputCreated) await unlink(output).catch(() => undefined)
  throw error
}
const archive = await stat(output)
if (archive.size > LIMITS.archive) {
  await unlink(output)
  throw new Error(`Archive is ${(archive.size / 1024 / 1024).toFixed(2)} MiB, above the 10 MiB limit.`)
}
console.log(`${output}\n${files.length} files, ${(archive.size / 1024).toFixed(1)} KiB compressed`)

async function collectFiles(root) {
  const pending = [root], files = [], names = new Set()
  let total = 0
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const path = relative(root, absolute).split(sep).join('/')
      const details = await lstat(absolute)
      if (details.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${path}`)
      if (entry.isDirectory()) pending.push(absolute)
      else if (entry.isFile()) {
        if (!safePath(path)) throw new Error(`Unsafe package path: ${path}`)
        const key = path.normalize('NFC').toLowerCase()
        if (names.has(key)) throw new Error(`Duplicate package path: ${path}`)
        names.add(key)
        if (details.size > LIMITS.file) throw new Error(`${path} exceeds 8 MiB.`)
        total += details.size
        if (total > LIMITS.extracted) throw new Error('Package exceeds the 25 MiB extracted limit.')
        files.push({ absolute, path, bytes: details.size })
        if (files.length > LIMITS.entries) throw new Error('Package exceeds the 256-entry limit.')
      } else throw new Error(`Special files are not allowed: ${path}`)
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('manifest.json must contain an object.')
  const allowed = new Set(['schemaVersion', 'kind', 'id', 'name', 'version', 'entry', 'description', 'author', 'icon', 'window'])
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Unknown manifest field: ${key}`)
  if (value.schemaVersion !== 1 || value.kind !== 'game') throw new Error('Only schemaVersion 1 game packages are supported.')
  if (typeof value.id !== 'string' || value.id.length > 255 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value.id)) throw new Error('id must use lowercase reverse-DNS format and contain at most 255 characters.')
  if (!/^(?:0|[1-9][0-9]{0,5})(?:\.(?:0|[1-9][0-9]{0,5})){2}$/.test(value.version ?? '')) throw new Error('version must use numeric MAJOR.MINOR.PATCH.')
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80) throw new Error('name must contain 1-80 characters.')
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.trim().length > 500)) throw new Error('description must contain at most 500 characters.')
  if (value.author !== undefined && (typeof value.author !== 'string' || value.author.trim().length > 120)) throw new Error('author must contain at most 120 characters.')
  if (!safePath(value.entry) || !value.entry.toLowerCase().endsWith('.html')) throw new Error('entry must be a package-relative HTML path.')
  if (value.icon !== undefined && (!safePath(value.icon) || !/\.(png|webp)$/i.test(value.icon))) throw new Error('icon must be a package-relative PNG or WebP path.')
  const window = value.window
  if (!window || typeof window !== 'object' || Array.isArray(window) || Object.keys(window).some((key) => !['width', 'height', 'minWidth', 'minHeight', 'resizable'].includes(key))) throw new Error('window is invalid.')
  for (const key of ['width', 'height', 'minWidth', 'minHeight']) if (!Number.isInteger(window[key])) throw new Error(`window.${key} must be an integer.`)
  if (window.width < 320 || window.width > 1600 || window.height < 320 || window.height > 1200 || window.minWidth < 280 || window.minWidth > window.width || window.minHeight < 280 || window.minHeight > window.height || typeof window.resizable !== 'boolean') throw new Error('window dimensions are outside supported bounds.')
  return value
}

function safePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !value.includes('\\') && !/[\u0000-\u001f<>:"|?*#%]/.test(value) && !value.startsWith('/') && value.split('/').every((segment) => {
    if (!segment || segment === '.' || segment === '..' || /[. ]$/.test(segment)) return false
    return !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(segment.split('.')[0])
  })
}

function assertIconBytes(path, bytes) {
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  const webp = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (path.toLowerCase().endsWith('.png') ? !png : !webp) throw new Error('Icon content does not match its PNG or WebP extension.')
}
