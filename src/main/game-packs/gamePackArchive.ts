import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import * as yauzl from 'yauzl'
import { GAME_PACK_LIMITS, gamePackManifestV1Schema, isSafeGamePackPath, type GamePackManifestV1 } from '../../shared/contracts/gamePacks'

export type GamePackArchiveInspection = {
  manifest: GamePackManifestV1
  sha256: string
  compressedBytes: number
  extractedBytes: number
  entryCount: number
  files: string[]
}

type CheckedEntry = { entry: yauzl.Entry; path: string; directory: boolean }

export async function inspectGamePackArchive(archivePath: string): Promise<GamePackArchiveInspection> {
  const archive = await stat(archivePath)
  if (!archive.isFile()) throw new Error('GAME_PACK_INVALID: Selected package is not a file.')
  if (archive.size > GAME_PACK_LIMITS.archiveBytes) throw new Error('GAME_PACK_TOO_LARGE: Package exceeds the 10 MiB compressed limit.')

  const sha256 = await sha256File(archivePath)
  const zip = await yauzl.openPromise(archivePath, { autoClose: false, lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true })
  try {
    if (zip.entryCount > GAME_PACK_LIMITS.entries) throw new Error('GAME_PACK_TOO_MANY_FILES: Package exceeds the 256-entry limit.')
    const checked = await collectEntries(zip)
    const manifestEntry = checked.find((item) => item.path === 'manifest.json' && !item.directory)
    if (!manifestEntry) throw new Error('GAME_PACK_MANIFEST_MISSING: manifest.json must exist at the package root.')
    if (manifestEntry.entry.uncompressedSize > GAME_PACK_LIMITS.manifestBytes) throw new Error('GAME_PACK_MANIFEST_TOO_LARGE: manifest.json exceeds 64 KiB.')
    const manifestBytes = await readEntry(zip, manifestEntry.entry, GAME_PACK_LIMITS.manifestBytes)
    let raw: unknown
    try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)) } catch {
      throw new Error('GAME_PACK_MANIFEST_INVALID: manifest.json is not valid UTF-8 JSON.')
    }
    const parsed = gamePackManifestV1Schema.safeParse(raw)
    if (!parsed.success) throw new Error(`GAME_PACK_MANIFEST_INVALID: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`).join('; ')}`)
    const manifest = parsed.data
    const files = new Set(checked.filter((item) => !item.directory).map((item) => item.path))
    if (!files.has(manifest.entry)) throw new Error(`GAME_PACK_ENTRY_MISSING: Entry file "${manifest.entry}" is missing.`)
    if (manifest.icon) {
      const icon = checked.find((item) => item.path === manifest.icon && !item.directory)
      if (!icon) throw new Error(`GAME_PACK_ICON_MISSING: Icon file "${manifest.icon}" is missing.`)
      if (icon.entry.uncompressedSize > GAME_PACK_LIMITS.iconBytes) throw new Error('GAME_PACK_ICON_TOO_LARGE: Icon exceeds 256 KiB.')
      assertIconBytes(manifest.icon, await readEntry(zip, icon.entry, GAME_PACK_LIMITS.iconBytes))
    }
    return {
      manifest,
      sha256,
      compressedBytes: archive.size,
      extractedBytes: checked.reduce((total, item) => total + item.entry.uncompressedSize, 0),
      entryCount: checked.length,
      files: [...files].sort()
    }
  } finally {
    zip.close()
  }
}

export async function extractGamePackArchive(archivePath: string, destination: string, expectedSha256: string): Promise<GamePackArchiveInspection> {
  const inspection = await inspectGamePackArchive(archivePath)
  if (inspection.sha256 !== expectedSha256) throw new Error('GAME_PACK_CHANGED: Package changed after it was inspected. Choose it again.')
  await mkdir(destination, { recursive: true, mode: 0o700 })
  const destinationRoot = resolve(destination)
  const zip = await yauzl.openPromise(archivePath, { autoClose: false, lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true })
  try {
    const checked = await collectEntries(zip)
    for (const item of checked) {
      const output = resolve(destinationRoot, ...item.path.split('/'))
      if (output !== destinationRoot && !output.startsWith(`${destinationRoot}${sep}`)) throw new Error('GAME_PACK_PATH_INVALID: Package entry escapes its install directory.')
      if (item.directory) {
        await mkdir(output, { recursive: true, mode: 0o700 })
        continue
      }
      await mkdir(dirname(output), { recursive: true, mode: 0o700 })
      await writeFile(output, await readEntry(zip, item.entry, GAME_PACK_LIMITS.fileBytes), { mode: 0o600, flag: 'wx' })
      await chmod(output, 0o600).catch(() => undefined)
    }
  } finally {
    zip.close()
  }
  if (await sha256File(archivePath) !== expectedSha256) throw new Error('GAME_PACK_CHANGED: Package changed while it was being installed.')
  return inspection
}

async function collectEntries(zip: yauzl.ZipFile): Promise<CheckedEntry[]> {
  const entries: CheckedEntry[] = []
  const names = new Set<string>()
  let extractedBytes = 0
  for await (const entry of zip.eachEntry()) {
    const checked = checkEntry(entry)
    const collisionKey = checked.path.normalize('NFC').toLowerCase()
    if (names.has(collisionKey)) throw new Error(`GAME_PACK_DUPLICATE_ENTRY: Duplicate entry "${checked.path}".`)
    names.add(collisionKey)
    if (entry.uncompressedSize > GAME_PACK_LIMITS.fileBytes && !checked.directory) throw new Error(`GAME_PACK_FILE_TOO_LARGE: "${checked.path}" exceeds 8 MiB.`)
    extractedBytes += entry.uncompressedSize
    if (extractedBytes > GAME_PACK_LIMITS.extractedBytes) throw new Error('GAME_PACK_TOO_LARGE: Package exceeds the 25 MiB extracted limit.')
    entries.push(checked)
    if (entries.length > GAME_PACK_LIMITS.entries) throw new Error('GAME_PACK_TOO_MANY_FILES: Package exceeds the 256-entry limit.')
  }
  return entries
}

function checkEntry(entry: yauzl.Entry): CheckedEntry {
  if (entry.isEncrypted() || (entry.generalPurposeBitFlag & 1) !== 0) throw new Error('GAME_PACK_ENCRYPTED: Encrypted ZIP entries are not supported.')
  if (!entry.canDecodeFileData() || (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)) throw new Error('GAME_PACK_COMPRESSION_UNSUPPORTED: ZIP entry uses an unsupported compression method.')
  const original = entry.fileName
  const directory = original.endsWith('/')
  const path = directory ? original.slice(0, -1) : original
  if (path.length > 1_024 || !isSafeGamePackPath(path)) {
    throw new Error(`GAME_PACK_PATH_INVALID: Unsafe ZIP entry "${original}".`)
  }
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff
  const unixType = unixMode & 0o170000
  if (unixType === 0o120000) throw new Error(`GAME_PACK_LINK_FORBIDDEN: Symbolic link "${path}" is not allowed.`)
  const expectedType = directory ? 0o040000 : 0o100000
  if (unixType !== 0 && unixType !== expectedType) throw new Error(`GAME_PACK_SPECIAL_FILE_FORBIDDEN: Special entry "${path}" is not allowed.`)
  if (directory && entry.uncompressedSize !== 0) throw new Error(`GAME_PACK_PATH_INVALID: Directory entry "${path}" contains data.`)
  return { entry, path, directory }
}

async function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, limit: number): Promise<Buffer> {
  const stream = await zip.openReadStreamPromise(entry)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) {
      stream.destroy()
      throw new Error(`GAME_PACK_FILE_TOO_LARGE: "${entry.fileName}" exceeds its size limit.`)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks, size)
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

function assertIconBytes(path: string, bytes: Uint8Array): void {
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  const webp = bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  if (path.toLowerCase().endsWith('.png') ? !png : !webp) throw new Error('GAME_PACK_ICON_INVALID: Icon content does not match its PNG or WebP extension.')
}
