import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFERENCES, NotificationPreferencesRepository } from './notificationPreferencesRepository'

describe('NotificationPreferencesRepository', () => {
  it('returns enabled versioned defaults when the preference file is missing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-notifications-'))
    const repository = new NotificationPreferencesRepository(join(directory, 'notifications.json'))

    const snapshot = await repository.read()

    expect(snapshot.values).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(snapshot.revision).toHaveLength(64)
  })

  it('persists preferences, backs up an existing file, and rejects stale revisions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-notifications-'))
    const path = join(directory, 'notifications.json')
    const repository = new NotificationPreferencesRepository(path)
    const initial = await repository.read()
    const first = await repository.save(initial.revision, { ...initial.values, sound: false })
    const second = await repository.save(first.revision, { ...first.values, turnCompleted: false })
    const persisted = await readFile(path, 'utf8')

    expect(JSON.parse(persisted)).toEqual(second.values)
    expect((await readdir(directory)).some((name) => name.startsWith('notifications.json.bak-'))).toBe(true)
    await expect(repository.save(first.revision, second.values)).rejects.toThrow('SETTINGS_CONFLICT')
    expect(await readFile(path, 'utf8')).toBe(persisted)
  })

  it('reports a malformed file without overwriting it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-notifications-'))
    const path = join(directory, 'notifications.json')
    const source = '{"schemaVersion":1,"enabled":"yes"}\n'
    await writeFile(path, source, 'utf8')
    const repository = new NotificationPreferencesRepository(path)

    await expect(repository.read()).rejects.toThrow(`Cannot read ${path}`)
    await expect(repository.save('0'.repeat(64), DEFAULT_NOTIFICATION_PREFERENCES)).rejects.toThrow(`Cannot read ${path}`)
    expect(await readFile(path, 'utf8')).toBe(source)
  })
})
