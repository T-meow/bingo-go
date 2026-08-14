import { chmod, copyFile, mkdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { notificationPreferencesSchema, type NotificationPreferencesV1 } from '../../shared/contracts/ipc'

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesV1 = {
  schemaVersion: 1,
  enabled: true,
  turnCompleted: true,
  actionRequired: true,
  failures: true,
  sound: true
}

const MISSING_REVISION = createHash('sha256').update('').digest('hex')

export type StoredNotificationPreferencesSnapshot = {
  path: string
  revision: string
  values: NotificationPreferencesV1
}

export class NotificationPreferencesRepository {
  constructor(private readonly path: string) {}

  async read(): Promise<StoredNotificationPreferencesSnapshot> {
    let source: string
    try {
      source = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { path: this.path, revision: MISSING_REVISION, values: { ...DEFAULT_NOTIFICATION_PREFERENCES } }
      }
      throw error
    }

    try {
      const values = notificationPreferencesSchema.parse(JSON.parse(source))
      return { path: this.path, revision: createHash('sha256').update(source).digest('hex'), values }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid notification preferences'
      throw new Error(`Cannot read ${this.path}: ${message}`)
    }
  }

  async save(baseRevision: string, values: NotificationPreferencesV1): Promise<StoredNotificationPreferencesSnapshot> {
    const before = await this.read()
    if (before.revision !== baseRevision) throw new Error('SETTINGS_CONFLICT: Notification preferences changed on disk. Reload and retry.')
    const parsed = notificationPreferencesSchema.parse(values)
    if (before.revision !== MISSING_REVISION) {
      const backupPath = `${this.path}.bak-${timestamp()}`
      await copyFile(this.path, backupPath)
      await chmod(backupPath, 0o600).catch(() => undefined)
    }
    await mkdir(dirname(this.path), { recursive: true })
    await writeFileAtomic(this.path, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600, fsync: true })
    await chmod(this.path, 0o600).catch(() => undefined)
    return this.read()
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}
