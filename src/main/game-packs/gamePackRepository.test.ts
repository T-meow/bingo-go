import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import yazl from 'yazl'
import { BUILTIN_GAME_PACK_IDS, GamePackRepository } from './gamePackRepository'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('GamePackRepository', () => {
  it('installs enabled by default and supports revisioned disable and recoverable uninstall', async () => {
    const fixture = await createFixture()
    const archive = await createArchive(fixture.root, 'com.example.counter', '1.0.0', 'v1')
    const before = await fixture.repository.initialize()
    expect(before.items.filter((item) => item.source === 'builtin')).toHaveLength(3)

    const preview = await fixture.repository.previewImport(archive)
    expect(preview).toMatchObject({ relation: 'new', unsigned: true, manifest: { id: 'com.example.counter' } })
    const installed = await fixture.repository.install(preview.token, before.revision)
    const external = installed.items.find((item) => item.source === 'external')!
    expect(external).toMatchObject({ enabled: true, status: 'ready', manifest: { version: '1.0.0' } })
    expect((await fixture.repository.resolveLaunch('com.example.counter')).root).toContain(external.sha256)

    const disabled = await fixture.repository.setEnabled('com.example.counter', false, installed.revision)
    expect(disabled.items.find((item) => item.manifest.id === 'com.example.counter')?.enabled).toBe(false)
    await expect(fixture.repository.setEnabled('com.example.counter', true, installed.revision)).rejects.toThrow('GAME_PACK_CONFLICT')

    const uninstalled = await fixture.repository.uninstall('com.example.counter', disabled.revision)
    expect(uninstalled.items.some((item) => item.manifest.id === 'com.example.counter')).toBe(false)
    expect((await readdir(join(fixture.root, 'repository', 'archive'))).length).toBeGreaterThan(0)
  })

  it('classifies upgrades, same-version replacements and downgrades', async () => {
    const fixture = await createFixture()
    let snapshot = await fixture.repository.initialize()
    for (const [version, relation] of [['1.0.0', 'new'], ['2.0.0', 'upgrade'], ['2.0.0', 'same'], ['1.5.0', 'downgrade']] as const) {
      const archive = await createArchive(fixture.root, 'com.example.counter', version, `${version}-${relation}`)
      const preview = await fixture.repository.previewImport(archive)
      expect(preview.relation).toBe(relation)
      snapshot = await fixture.repository.install(preview.token, snapshot.revision)
      expect(snapshot.items.find((item) => item.manifest.id === 'com.example.counter')?.manifest.version).toBe(version)
    }
  })

  it('never allows an external package to occupy a reserved built-in ID', async () => {
    const fixture = await createFixture()
    await fixture.repository.initialize()
    const archive = await createArchive(fixture.root, BUILTIN_GAME_PACK_IDS[0], '9.0.0', 'override')
    await expect(fixture.repository.previewImport(archive)).rejects.toThrow('GAME_PACK_BUILTIN_CONFLICT')
  })

  it('restores the previous package when the registry commit fails', async () => {
    const fixture = await createFixture()
    let snapshot = await fixture.repository.initialize()
    const first = await fixture.repository.previewImport(await createArchive(fixture.root, 'com.example.counter', '1.0.0', 'v1'))
    snapshot = await fixture.repository.install(first.token, snapshot.revision)
    const second = await fixture.repository.previewImport(await createArchive(fixture.root, 'com.example.counter', '2.0.0', 'v2'))
    const internals = fixture.repository as unknown as { writeRegistry: (revision: string, registry: unknown) => Promise<void> }
    const writeRegistry = internals.writeRegistry.bind(fixture.repository)
    internals.writeRegistry = vi.fn().mockRejectedValueOnce(new Error('simulated registry failure'))

    await expect(fixture.repository.install(second.token, snapshot.revision)).rejects.toThrow('simulated registry failure')
    internals.writeRegistry = writeRegistry

    const launch = await fixture.repository.resolveLaunch('com.example.counter')
    expect(launch.manifest.version).toBe('1.0.0')
    expect(await readFile(join(launch.root, 'index.html'), 'utf8')).toContain('v1')
  })

  it('isolates content corruption and can still uninstall a missing package directory', async () => {
    const fixture = await createFixture()
    const archive = await createArchive(fixture.root, 'com.example.counter', '1.0.0', 'v1')
    let snapshot = await fixture.repository.initialize()
    const preview = await fixture.repository.previewImport(archive)
    snapshot = await fixture.repository.install(preview.token, snapshot.revision)
    const record = JSON.parse(await readFile(join(fixture.root, 'repository', 'registry.json'), 'utf8')).external['com.example.counter']
    await writeFile(join(fixture.root, 'repository', 'installed', record.directory, 'index.html'), 'tampered')
    expect((await fixture.repository.list()).items.find((item) => item.manifest.id === 'com.example.counter')).toMatchObject({ status: 'invalid' })

    await rm(join(fixture.root, 'repository', 'installed', record.directory), { recursive: true })
    const next = await fixture.repository.uninstall('com.example.counter', snapshot.revision)
    expect(next.items.some((item) => item.manifest.id === 'com.example.counter')).toBe(false)
  })
})

async function createFixture(): Promise<{ root: string; repository: GamePackRepository }> {
  const root = await mkdtemp(join(tmpdir(), 'bingo-game-repository-'))
  roots.push(root)
  const builtins = join(root, 'builtins')
  for (const id of BUILTIN_GAME_PACK_IDS) {
    const directory = join(builtins, id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest(id, '1.0.0')))
    await writeFile(join(directory, 'index.html'), '<!doctype html>')
  }
  return { root, repository: new GamePackRepository(join(root, 'repository'), builtins) }
}

async function createArchive(root: string, id: string, version: string, content: string): Promise<string> {
  const path = join(root, `${id}-${version}-${content}.bingo-pack`)
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify(manifest(id, version))), 'manifest.json', { mode: 0o100644 })
  zip.addBuffer(Buffer.from(`<!doctype html><title>${content}</title>`), 'index.html', { mode: 0o100644 })
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(path)
    output.on('close', resolve); output.on('error', reject); zip.outputStream.on('error', reject); zip.outputStream.pipe(output); zip.end()
  })
  return path
}

function manifest(id: string, version: string): object {
  return { schemaVersion: 1, kind: 'game', id, name: id.split('.').at(-1), version, entry: 'index.html', window: { width: 480, height: 600, minWidth: 360, minHeight: 480, resizable: true } }
}
