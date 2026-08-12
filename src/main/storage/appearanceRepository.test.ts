import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppearanceRepository } from './appearanceRepository'

describe('AppearanceRepository', () => {
  it('starts with the eye-comfort accent and persists a versioned preference file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rei-appearance-'))
    const path = join(directory, 'preferences.json')
    const repository = new AppearanceRepository(path)
    const before = await repository.read()

    expect(before.values).toEqual({
      schemaVersion: 1,
      colorMode: 'system',
      accentColor: '#756AA8',
      density: 'comfortable',
      motion: 'system',
      inspectorCollapsed: false
    })

    const saved = await repository.save(before.revision, { ...before.values, colorMode: 'dark', density: 'compact' })
    expect(saved.values).toMatchObject({ colorMode: 'dark', density: 'compact' })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(saved.values)
  })

  it('backs up existing preferences and rejects stale revisions without writing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rei-appearance-'))
    const path = join(directory, 'preferences.json')
    const repository = new AppearanceRepository(path)
    const initial = await repository.read()
    const first = await repository.save(initial.revision, initial.values)
    const second = await repository.save(first.revision, { ...first.values, accentColor: '#3F7C75' })
    const source = await readFile(path, 'utf8')

    expect((await readdir(directory)).some((name) => name.startsWith('preferences.json.bak-'))).toBe(true)
    await expect(repository.save(first.revision, second.values)).rejects.toThrow('SETTINGS_CONFLICT')
    expect(await readFile(path, 'utf8')).toBe(source)
  })
})
