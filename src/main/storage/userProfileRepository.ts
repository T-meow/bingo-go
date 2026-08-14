import { createHash, randomInt } from 'node:crypto'
import { access, chmod, copyFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { availableGeometricAvatarIds, isBuiltinAvatarId } from '../../shared/avatars'
import { userProfileSchema, type UserProfileSnapshot, type UserProfileV1 } from '../../shared/contracts/ipc'

const USER_AVATAR_PATTERN = /^user:([0-9a-f]{64})$/

export class UserProfileRepository {
  constructor(private readonly path: string, private readonly avatarDirectory: string) {}

  async initialize(): Promise<UserProfileSnapshot> {
    try {
      return await this.read()
    } catch (error) {
      if (!isMissing(error)) throw error
      const pool = availableGeometricAvatarIds([])
      await this.write({ schemaVersion: 1, avatar: pool[randomInt(pool.length)] }, false)
      return this.read()
    }
  }

  async read(): Promise<UserProfileSnapshot> {
    let source: string
    try { source = await readFile(this.path, 'utf8') } catch (error) {
      if (isMissing(error)) throw Object.assign(new Error('PROFILE_MISSING: User profile has not been initialized.'), { code: 'ENOENT' })
      throw error
    }
    let raw: unknown
    try { raw = JSON.parse(source) } catch (error) {
      throw new Error(`CONFIG_INVALID: Cannot read ${this.path}: ${error instanceof Error ? error.message : 'invalid JSON'}`)
    }
    const values = userProfileSchema.parse(raw)
    const customHash = customAvatarHash(values.avatar)
    let avatarDataUrl: string | undefined
    if (customHash) {
      const bytes = await readFile(join(this.avatarDirectory, `${customHash}.png`)).catch((error) => {
        throw new Error(`CONFIG_INVALID: Profile avatar ${values.avatar} is unavailable: ${error instanceof Error ? error.message : 'read failed'}`)
      })
      avatarDataUrl = `data:image/png;base64,${bytes.toString('base64')}`
    } else if (!isBuiltinAvatarId(values.avatar)) {
      throw new Error(`CONFIG_INVALID: Unknown profile avatar "${values.avatar}".`)
    }
    return {
      path: this.path,
      revision: createHash('sha256').update(source).digest('hex'),
      values,
      ...(avatarDataUrl ? { avatarDataUrl } : {})
    }
  }

  async save(baseRevision: string, avatar: string, png?: Buffer): Promise<UserProfileSnapshot> {
    const before = await this.read()
    if (before.revision !== baseRevision) throw new Error('SETTINGS_CONFLICT: User profile changed on disk. Reload and retry.')
    if (png) {
      const digest = createHash('sha256').update(png).digest('hex')
      if (avatar !== `user:${digest}`) throw new Error('CONFIG_INVALID: Profile avatar hash does not match its content.')
      await mkdir(this.avatarDirectory, { recursive: true })
      const target = join(this.avatarDirectory, `${digest}.png`)
      try { await access(target) } catch { await writeFileAtomic(target, png, { mode: 0o600, fsync: true }) }
    } else if (customAvatarHash(avatar)) {
      await access(join(this.avatarDirectory, `${customAvatarHash(avatar)}.png`)).catch(() => {
        throw new Error(`CONFIG_INVALID: Profile avatar ${avatar} is unavailable.`)
      })
    } else if (!isBuiltinAvatarId(avatar)) {
      throw new Error(`CONFIG_INVALID: Unknown profile avatar "${avatar}".`)
    }
    await this.write({ schemaVersion: 1, avatar }, true)
    return this.read()
  }

  private async write(values: UserProfileV1, backup: boolean): Promise<void> {
    if (backup) {
      const backupPath = `${this.path}.bak-${timestamp()}`
      await copyFile(this.path, backupPath)
      await chmod(backupPath, 0o600).catch(() => undefined)
    }
    await mkdir(dirname(this.path), { recursive: true })
    await writeFileAtomic(this.path, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600, fsync: true })
  }
}

function customAvatarHash(avatar: string): string | null {
  return USER_AVATAR_PATTERN.exec(avatar)?.[1] ?? null
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}
