import { chmod, copyFile, mkdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { appearancePreferencesSchema, type AppearancePreferencesV1, type AppearanceSnapshot } from '../../shared/contracts/ipc'

const DEFAULT_APPEARANCE: AppearancePreferencesV1 = {
  schemaVersion: 1,
  colorMode: 'system',
  accentColor: '#756AA8',
  density: 'comfortable',
  motion: 'system',
  inspectorCollapsed: false
}
const MISSING_REVISION = createHash('sha256').update('').digest('hex')

export class AppearanceRepository {
  constructor(private readonly path: string) {}

  async read(): Promise<AppearanceSnapshot> {
    let source: string
    try {
      source = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { path: this.path, revision: MISSING_REVISION, values: DEFAULT_APPEARANCE }
      }
      throw error
    }
    let raw: unknown
    try { raw = JSON.parse(source) } catch (error) {
      throw new Error(`Cannot read ${this.path}: ${error instanceof Error ? error.message : 'invalid JSON'}`)
    }
    return {
      path: this.path,
      revision: createHash('sha256').update(source).digest('hex'),
      values: appearancePreferencesSchema.parse(raw)
    }
  }

  async save(baseRevision: string, values: AppearancePreferencesV1): Promise<AppearanceSnapshot> {
    const before = await this.read()
    if (before.revision !== baseRevision) throw new Error('SETTINGS_CONFLICT: Appearance preferences changed on disk. Reload and retry.')
    const parsed = appearancePreferencesSchema.parse(values)
    if (before.revision !== MISSING_REVISION) {
      const backupPath = `${this.path}.bak-${timestamp()}`
      await copyFile(this.path, backupPath)
      await chmod(backupPath, 0o600).catch(() => undefined)
    }
    await mkdir(dirname(this.path), { recursive: true })
    await writeFileAtomic(this.path, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600, fsync: true })
    return this.read()
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}
