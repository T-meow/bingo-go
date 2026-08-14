import { randomUUID, createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { z } from 'zod'
import {
  compareGamePackVersions,
  gamePackIdSchema,
  gamePackImportPreviewSchema,
  gamePackManifestV1Schema,
  gamePackSha256Schema,
  gamePackSnapshotSchema,
  type GamePackImportPreview,
  type GamePackItem,
  type GamePackManifestV1,
  type GamePackSnapshot,
  type GamePackVersionRelation
} from '../../shared/contracts/gamePacks'
import { extractGamePackArchive, inspectGamePackArchive } from './gamePackArchive'
import { validateGamePackDirectory } from './gamePackDirectory'

const TOKEN_TTL_MS = 10 * 60 * 1_000
const MISSING_REVISION = createHash('sha256').update('').digest('hex')
export const BUILTIN_GAME_PACK_IDS = [
  'io.github.tmeow.bingogo.bingo',
  'io.github.tmeow.bingogo.sudoku',
  'io.github.tmeow.bingogo.snake'
] as const

const registrySchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.record(gamePackIdSchema, z.boolean()),
  external: z.record(gamePackIdSchema, z.object({
    manifest: gamePackManifestV1Schema,
    sha256: gamePackSha256Schema,
    contentSha256: gamePackSha256Schema,
    installedAt: z.string().datetime(),
    directory: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict())
}).strict()

type Registry = z.infer<typeof registrySchema>
type ImportToken = {
  path: string
  preview: GamePackImportPreview
  expiresAtMs: number
}

export class GamePackRepository {
  private readonly registryPath: string
  private readonly installedPath: string
  private readonly stagingPath: string
  private readonly archivePath: string
  private readonly tokens = new Map<string, ImportToken>()

  constructor(
    private readonly root: string,
    private readonly builtinRoot: string,
    private readonly now: () => Date = () => new Date()
  ) {
    this.registryPath = join(root, 'registry.json')
    this.installedPath = join(root, 'installed')
    this.stagingPath = join(root, 'staging')
    this.archivePath = join(root, 'archive')
  }

  async initialize(): Promise<GamePackSnapshot> {
    await Promise.all([
      mkdir(this.root, { recursive: true, mode: 0o700 }),
      mkdir(this.installedPath, { recursive: true, mode: 0o700 }),
      mkdir(this.stagingPath, { recursive: true, mode: 0o700 }),
      mkdir(this.archivePath, { recursive: true, mode: 0o700 })
    ])
    return this.list()
  }

  async list(): Promise<GamePackSnapshot> {
    const stored = await this.readRegistry()
    const builtins = await this.readBuiltins(stored.registry)
    const builtinIds = new Set<string>(BUILTIN_GAME_PACK_IDS)
    const external = await Promise.all(Object.entries(stored.registry.external).map(async ([id, record]): Promise<GamePackItem> => {
      let error: string | undefined
      try {
        if (id !== record.manifest.id || builtinIds.has(id)) throw new Error('Registry contains an invalid or reserved package ID.')
        const validated = await validateGamePackDirectory(join(this.installedPath, record.directory))
        if (JSON.stringify(validated.manifest) !== JSON.stringify(record.manifest)) throw new Error('Installed manifest differs from the registry.')
        if (validated.sha256 !== record.contentSha256) throw new Error('Installed package content hash differs from the registry.')
      } catch (caught) {
        error = errorMessage(caught, 'Installed package is invalid.')
      }
      return {
        manifest: record.manifest,
        source: 'external',
        enabled: stored.registry.enabled[id] ?? true,
        status: error ? 'invalid' : 'ready',
        sha256: record.sha256,
        installedAt: record.installedAt,
        ...(error ? { error } : {})
      }
    }))
    const warnings = [...builtins.warnings, ...external.filter((item) => item.error).map((item) => `${item.manifest.id}: ${item.error}`)].map((warning) => warning.slice(0, 2_000))
    return gamePackSnapshotSchema.parse({
      revision: stored.revision,
      items: [...builtins.items, ...external].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name)),
      warnings
    })
  }

  async previewImport(path: string): Promise<GamePackImportPreview> {
    this.pruneTokens()
    const inspection = await inspectGamePackArchive(path)
    const current = await this.list()
    if ((BUILTIN_GAME_PACK_IDS as readonly string[]).includes(inspection.manifest.id)) {
      throw new Error(`GAME_PACK_BUILTIN_CONFLICT: Built-in package "${inspection.manifest.id}" cannot be replaced.`)
    }
    const existing = current.items.find((item) => item.source === 'external' && item.manifest.id === inspection.manifest.id)
    const relation = versionRelation(inspection.manifest.version, existing?.manifest.version)
    const token = randomUUID()
    const expiresAtMs = this.now().getTime() + TOKEN_TTL_MS
    const preview = gamePackImportPreviewSchema.parse({
      token,
      manifest: inspection.manifest,
      sha256: inspection.sha256,
      relation,
      ...(existing ? { existingVersion: existing.manifest.version } : {}),
      compressedBytes: inspection.compressedBytes,
      extractedBytes: inspection.extractedBytes,
      entryCount: inspection.entryCount,
      unsigned: true,
      expiresAt: new Date(expiresAtMs).toISOString()
    })
    this.tokens.set(token, { path, preview, expiresAtMs })
    return preview
  }

  async install(token: string, baseRevision: string): Promise<GamePackSnapshot> {
    this.pruneTokens()
    const pending = this.tokens.get(token)
    this.tokens.delete(token)
    if (!pending) throw new Error('GAME_PACK_TOKEN_EXPIRED: Import preview expired. Choose the package again.')
    const stored = await this.assertRevision(baseRevision)
    if ((BUILTIN_GAME_PACK_IDS as readonly string[]).includes(pending.preview.manifest.id)) throw new Error('GAME_PACK_BUILTIN_CONFLICT: A built-in package cannot be replaced.')

    const id = pending.preview.manifest.id
    const directory = pending.preview.sha256
    const stage = join(this.stagingPath, `${directory}-${randomUUID()}`)
    const destination = join(this.installedPath, directory)
    let oldArchive: string | undefined
    try {
      const inspection = await extractGamePackArchive(pending.path, stage, pending.preview.sha256)
      if (JSON.stringify(inspection.manifest) !== JSON.stringify(pending.preview.manifest)) throw new Error('GAME_PACK_CHANGED: Package manifest changed after preview.')
      const validated = await validateGamePackDirectory(stage)
      const previous = stored.registry.external[id]
      if (previous?.directory === directory) {
        oldArchive = join(this.archivePath, `${timestamp(this.now())}-${directory}-${randomUUID()}`)
        await rename(destination, oldArchive).catch((error) => { if (!isNotFound(error)) throw error })
      }
      try {
        await rename(stage, destination)
      } catch (error) {
        if (oldArchive) await rename(oldArchive, destination).catch(() => undefined)
        throw error
      }
      if (previous && previous.directory !== directory) {
        const previousPath = join(this.installedPath, previous.directory)
        oldArchive = join(this.archivePath, `${timestamp(this.now())}-${previous.directory}-${randomUUID()}`)
        await rename(previousPath, oldArchive).catch(() => { oldArchive = undefined })
      }
      const next: Registry = {
        schemaVersion: 1,
        enabled: { ...stored.registry.enabled, [id]: true },
        external: {
          ...stored.registry.external,
          [id]: { manifest: pending.preview.manifest, sha256: pending.preview.sha256, contentSha256: validated.sha256, installedAt: this.now().toISOString(), directory }
        }
      }
      try {
        await this.writeRegistry(stored.revision, next)
      } catch (error) {
        await rename(destination, join(this.archivePath, `${timestamp(this.now())}-rollback-${directory}-${randomUUID()}`)).catch(() => undefined)
        if (oldArchive && stored.registry.external[id]) await rename(oldArchive, join(this.installedPath, stored.registry.external[id].directory)).catch(() => undefined)
        throw error
      }
      return this.list()
    } catch (error) {
      await rm(stage, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  async setEnabled(id: string, enabled: boolean, baseRevision: string): Promise<GamePackSnapshot> {
    const snapshot = await this.list()
    if (snapshot.revision !== baseRevision) throw conflict()
    const item = snapshot.items.find((candidate) => candidate.manifest.id === id)
    if (!item) throw new Error(`GAME_PACK_NOT_FOUND: Game package "${id}" is not installed.`)
    if (enabled && item.status !== 'ready') throw new Error(`GAME_PACK_INVALID: Game package "${id}" cannot be enabled.`)
    const stored = await this.readRegistry()
    const next: Registry = { ...stored.registry, enabled: { ...stored.registry.enabled, [id]: enabled } }
    await this.writeRegistry(baseRevision, next)
    return this.list()
  }

  async validateRevision(baseRevision: string): Promise<void> {
    await this.assertRevision(baseRevision)
  }

  pendingPackageId(token: string): string {
    this.pruneTokens()
    const pending = this.tokens.get(token)
    if (!pending) throw new Error('GAME_PACK_TOKEN_EXPIRED: Import preview expired. Choose the package again.')
    return pending.preview.manifest.id
  }

  async uninstall(id: string, baseRevision: string): Promise<GamePackSnapshot> {
    const stored = await this.assertRevision(baseRevision)
    if ((BUILTIN_GAME_PACK_IDS as readonly string[]).includes(id)) throw new Error('GAME_PACK_BUILTIN: Built-in packages cannot be uninstalled.')
    const existing = stored.registry.external[id]
    if (!existing) throw new Error(`GAME_PACK_NOT_FOUND: Game package "${id}" is not installed.`)
    const nextExternal = { ...stored.registry.external }
    const nextEnabled = { ...stored.registry.enabled }
    delete nextExternal[id]
    delete nextEnabled[id]
    const archived = join(this.archivePath, `${timestamp(this.now())}-${existing.directory}-${randomUUID()}`)
    let archivedExisting = true
    await rename(join(this.installedPath, existing.directory), archived).catch((error) => {
      if (!isNotFound(error)) throw error
      archivedExisting = false
    })
    try {
      await this.writeRegistry(baseRevision, { schemaVersion: 1, enabled: nextEnabled, external: nextExternal })
    } catch (error) {
      if (archivedExisting) await rename(archived, join(this.installedPath, existing.directory)).catch(() => undefined)
      throw error
    }
    return this.list()
  }

  async resolveLaunch(id: string): Promise<{ manifest: GamePackManifestV1; root: string }> {
    const snapshot = await this.list()
    const item = snapshot.items.find((candidate) => candidate.manifest.id === id)
    if (!item) throw new Error(`GAME_PACK_NOT_FOUND: Game package "${id}" is not installed.`)
    if (!item.enabled) throw new Error(`GAME_PACK_DISABLED: Game package "${id}" is disabled.`)
    if (item.status !== 'ready') throw new Error(`GAME_PACK_INVALID: ${item.error ?? 'Game package is invalid.'}`)
    if (item.source === 'builtin') return { manifest: item.manifest, root: join(this.builtinRoot, id) }
    const stored = await this.readRegistry()
    const record = stored.registry.external[id]
    if (!record) throw new Error(`GAME_PACK_NOT_FOUND: Game package "${id}" is not installed.`)
    return { manifest: item.manifest, root: join(this.installedPath, record.directory) }
  }

  async has(id: string): Promise<boolean> {
    return (await this.list()).items.some((item) => item.manifest.id === id)
  }

  private async readBuiltins(registry: Registry): Promise<{ items: GamePackItem[]; warnings: string[] }> {
    const configured = BUILTIN_GAME_PACK_IDS
    const items: GamePackItem[] = []
    const warnings: string[] = []
    for (const id of configured) {
      try {
        const validated = await validateGamePackDirectory(join(this.builtinRoot, id), 1024 * 1024)
        if (validated.manifest.id !== id) throw new Error(`manifest ID must be ${id}`)
        items.push({ manifest: validated.manifest, source: 'builtin', enabled: registry.enabled[id] ?? true, status: 'ready', sha256: validated.sha256 })
      } catch (error) {
        warnings.push(`${id}: ${errorMessage(error, 'Built-in package is invalid.')}`)
      }
    }
    return { items, warnings }
  }

  private async readRegistry(): Promise<{ registry: Registry; revision: string }> {
    let source: string
    try { source = await readFile(this.registryPath, 'utf8') } catch (error) {
      if (isNotFound(error)) return { registry: { schemaVersion: 1, enabled: {}, external: {} }, revision: MISSING_REVISION }
      throw error
    }
    try {
      return { registry: registrySchema.parse(JSON.parse(source)), revision: createHash('sha256').update(source).digest('hex') }
    } catch (error) {
      throw new Error(`Cannot read ${this.registryPath}: ${error instanceof Error ? error.message : 'invalid registry'}`)
    }
  }

  private async assertRevision(baseRevision: string): Promise<{ registry: Registry; revision: string }> {
    const stored = await this.readRegistry()
    if (stored.revision !== baseRevision) throw conflict()
    return stored
  }

  private async writeRegistry(baseRevision: string, registry: Registry): Promise<void> {
    const stored = await this.assertRevision(baseRevision)
    const parsed = registrySchema.parse(registry)
    if (stored.revision !== MISSING_REVISION) {
      const backup = `${this.registryPath}.bak-${timestamp(this.now())}-${randomUUID()}`
      await copyFile(this.registryPath, backup)
      await chmod(backup, 0o600).catch(() => undefined)
    }
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    await writeFileAtomic(this.registryPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600, fsync: true })
    await chmod(this.registryPath, 0o600).catch(() => undefined)
  }

  private pruneTokens(): void {
    const now = this.now().getTime()
    for (const [token, value] of this.tokens) if (value.expiresAtMs <= now) this.tokens.delete(token)
  }
}

function versionRelation(next: string, existing?: string): GamePackVersionRelation {
  if (!existing) return 'new'
  const comparison = compareGamePackVersions(next, existing)
  return comparison > 0 ? 'upgrade' : comparison < 0 ? 'downgrade' : 'same'
}

function conflict(): Error {
  return new Error('GAME_PACK_CONFLICT: Game package registry changed. Reload and retry.')
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function timestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

function errorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return (/^GAME_PACK_[A-Z0-9_]+:/.test(message) ? message : fallback).slice(0, 2_000)
}
