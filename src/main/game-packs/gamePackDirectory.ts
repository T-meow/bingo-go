import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { GAME_PACK_LIMITS, gamePackManifestV1Schema, isSafeGamePackPath, type GamePackManifestV1 } from '../../shared/contracts/gamePacks'

export type ValidatedGamePackDirectory = { manifest: GamePackManifestV1; sha256: string; bytes: number; files: number }

export async function validateGamePackDirectory(root: string, maximumBytes = GAME_PACK_LIMITS.extractedBytes): Promise<ValidatedGamePackDirectory> {
  const resolvedRoot = resolve(root)
  const rootDetails = await lstat(resolvedRoot)
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) throw new Error('GAME_PACK_PATH_INVALID: Package root must be a real directory.')
  const pending = [resolvedRoot]
  const files: Array<{ absolute: string; relative: string; bytes: number }> = []
  const directories: string[] = []
  let bytes = 0
  let entries = 0
  while (pending.length > 0) {
    const directory = pending.pop()!
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const relativePath = relative(resolvedRoot, absolute).split(sep).join('/')
      if (!isSafeGamePackPath(relativePath)) throw new Error('GAME_PACK_PATH_INVALID: Installed package contains an unsafe path.')
      const details = await lstat(absolute)
      entries += 1
      if (entries > GAME_PACK_LIMITS.entries) throw new Error('GAME_PACK_TOO_MANY_FILES: Installed package exceeds the 256-entry limit.')
      if (details.isSymbolicLink()) throw new Error(`GAME_PACK_LINK_FORBIDDEN: Symbolic link "${relativePath}" is not allowed.`)
      if (details.isDirectory()) {
        directories.push(relativePath)
        pending.push(absolute)
      } else if (details.isFile()) {
        if (details.size > GAME_PACK_LIMITS.fileBytes) throw new Error(`GAME_PACK_FILE_TOO_LARGE: "${relativePath}" exceeds 8 MiB.`)
        bytes += details.size
        if (bytes > maximumBytes) throw new Error('GAME_PACK_TOO_LARGE: Installed package exceeds its size limit.')
        files.push({ absolute, relative: relativePath, bytes: details.size })
      } else {
        throw new Error(`GAME_PACK_SPECIAL_FILE_FORBIDDEN: Special entry "${relativePath}" is not allowed.`)
      }
    }
  }
  const manifestFile = files.find((file) => file.relative === 'manifest.json')
  if (!manifestFile) throw new Error('GAME_PACK_MANIFEST_MISSING: manifest.json is missing.')
  if (manifestFile.bytes > GAME_PACK_LIMITS.manifestBytes) throw new Error('GAME_PACK_MANIFEST_TOO_LARGE: manifest.json exceeds 64 KiB.')
  let raw: unknown
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(manifestFile.absolute))) } catch {
    throw new Error('GAME_PACK_MANIFEST_INVALID: manifest.json is not valid UTF-8 JSON.')
  }
  const parsed = gamePackManifestV1Schema.safeParse(raw)
  if (!parsed.success) throw new Error(`GAME_PACK_MANIFEST_INVALID: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`).join('; ')}`)
  const paths = new Set(files.map((file) => file.relative))
  if (!paths.has(parsed.data.entry)) throw new Error(`GAME_PACK_ENTRY_MISSING: Entry file "${parsed.data.entry}" is missing.`)
  if (parsed.data.icon) {
    const icon = files.find((file) => file.relative === parsed.data.icon)
    if (!icon) throw new Error(`GAME_PACK_ICON_MISSING: Icon file "${parsed.data.icon}" is missing.`)
    if (icon.bytes > GAME_PACK_LIMITS.iconBytes) throw new Error('GAME_PACK_ICON_TOO_LARGE: Icon exceeds 256 KiB.')
    assertIconBytes(parsed.data.icon, await readFile(icon.absolute))
  }
  const hash = createHash('sha256')
  for (const directory of directories.sort((left, right) => left.localeCompare(right))) hash.update('directory\0').update(directory).update('\0')
  for (const file of files.sort((left, right) => left.relative.localeCompare(right.relative))) {
    hash.update('file\0').update(file.relative).update('\0').update(await readFile(file.absolute)).update('\0')
  }
  return { manifest: parsed.data, sha256: hash.digest('hex'), bytes, files: files.length }
}

function assertIconBytes(path: string, bytes: Uint8Array): void {
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  const webp = bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  if (path.toLowerCase().endsWith('.png') ? !png : !webp) throw new Error('GAME_PACK_ICON_INVALID: Icon content does not match its PNG or WebP extension.')
}
