import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import yazl from 'yazl'
import { inspectGamePackArchive } from './gamePackArchive'

const execFileAsync = promisify(execFile)
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

const manifest = JSON.stringify({
  schemaVersion: 1, kind: 'game', id: 'com.example.game', name: 'Game', version: '1.0.0', entry: 'index.html',
  window: { width: 480, height: 600, minWidth: 360, minHeight: 480, resizable: true }
})

describe('game pack archive inspection', () => {
  it('inspects a valid archive without exposing a path', async () => {
    const path = await zip([['manifest.json', manifest], ['index.html', '<!doctype html>']])
    const result = await inspectGamePackArchive(path)
    expect(result.manifest.id).toBe('com.example.game')
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.entryCount).toBe(2)
  })

  it('rejects case-insensitive duplicate entries', async () => {
    const path = await zip([['manifest.json', manifest], ['index.html', 'a'], ['INDEX.HTML', 'b']])
    await expect(inspectGamePackArchive(path)).rejects.toThrow('GAME_PACK_DUPLICATE_ENTRY')
  })

  it('rejects traversal entries even when the ZIP writer normalized metadata', async () => {
    const safe = await zip([['manifest.json', manifest], ['index.html', 'safe']])
    const bytes = await readFile(safe)
    const needle = Buffer.from('index.html')
    let count = 0
    for (let offset = bytes.indexOf(needle); offset >= 0; offset = bytes.indexOf(needle, offset + needle.length)) {
      Buffer.from('../evil.x').copy(bytes, offset)
      count += 1
    }
    expect(count).toBeGreaterThanOrEqual(2)
    const path = join(await temporaryDirectory(), 'traversal.bingo-pack')
    await writeFile(path, bytes)
    await expect(inspectGamePackArchive(path)).rejects.toThrow(/invalid relative path|GAME_PACK_PATH_INVALID/i)
  })

  it('rejects symbolic links and extracted zip bombs', async () => {
    const link = await zip([['manifest.json', manifest], ['index.html', 'ok'], ['link', 'index.html', 0o120777]])
    await expect(inspectGamePackArchive(link)).rejects.toThrow('GAME_PACK_LINK_FORBIDDEN')
    const bomb = await zip([['manifest.json', manifest], ['index.html', 'ok'], ['large.bin', Buffer.alloc(8 * 1024 * 1024)], ['large-2.bin', Buffer.alloc(8 * 1024 * 1024)], ['large-3.bin', Buffer.alloc(8 * 1024 * 1024)], ['large-4.bin', Buffer.alloc(2 * 1024 * 1024)]])
    await expect(inspectGamePackArchive(bomb)).rejects.toThrow('GAME_PACK_TOO_LARGE')
  })

  it('rejects encrypted entry flags', async () => {
    const path = await zip([['manifest.json', manifest], ['index.html', 'safe']])
    const bytes = await readFile(path)
    setEncryptedFlags(bytes)
    await writeFile(path, bytes)
    await expect(inspectGamePackArchive(path)).rejects.toThrow('GAME_PACK_ENCRYPTED')
  })

  it('rejects an icon whose bytes do not match its extension', async () => {
    const withIcon = JSON.stringify({ ...JSON.parse(manifest), icon: 'icon.png' })
    const path = await zip([['manifest.json', withIcon], ['index.html', 'safe'], ['icon.png', 'not a PNG']])
    await expect(inspectGamePackArchive(path)).rejects.toThrow('GAME_PACK_ICON_INVALID')
  })

  it('accepts the package produced from the maintained author example', async () => {
    const projectRoot = resolve(import.meta.dirname, '../../..')
    const output = join(await temporaryDirectory(), 'example.bingo-pack')
    await execFileAsync(process.execPath, [join(projectRoot, 'scripts', 'pack-game.mjs'), join(projectRoot, 'games', 'examples', 'minimal'), output], { cwd: projectRoot })
    const result = await inspectGamePackArchive(output)
    expect(result).toMatchObject({ manifest: { id: 'com.example.counter', version: '1.0.0' }, entryCount: 4 })
  })
})

async function zip(entries: Array<[string, string | Buffer, number?]>): Promise<string> {
  const directory = await temporaryDirectory()
  const path = join(directory, 'game.bingo-pack')
  const archive = new yazl.ZipFile()
  for (const [name, value, mode] of entries) archive.addBuffer(Buffer.isBuffer(value) ? value : Buffer.from(value), name, { mode: mode ?? 0o100644, compress: true })
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(path)
    output.on('close', resolve); output.on('error', reject); archive.outputStream.on('error', reject); archive.outputStream.pipe(output); archive.end()
  })
  return path
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-pack-test-'))
  roots.push(directory)
  return directory
}

function setEncryptedFlags(bytes: Buffer): void {
  for (let offset = 0; offset < bytes.length - 10; offset += 1) {
    const signature = bytes.readUInt32LE(offset)
    const flagOffset = signature === 0x04034b50 ? offset + 6 : signature === 0x02014b50 ? offset + 8 : -1
    if (flagOffset >= 0) bytes.writeUInt16LE(bytes.readUInt16LE(flagOffset) | 1, flagOffset)
  }
}
