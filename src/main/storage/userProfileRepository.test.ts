import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GEOMETRIC_AVATAR_IDS } from '../../shared/avatars'
import { UserProfileRepository } from './userProfileRepository'
import { createHash } from 'node:crypto'

describe('UserProfileRepository', () => {
  it('chooses one geometric avatar on first initialization and keeps it across restarts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-profile-'))
    const path = join(directory, 'profile.json')
    const avatars = join(directory, 'avatars')
    const first = await new UserProfileRepository(path, avatars).initialize()
    const second = await new UserProfileRepository(path, avatars).initialize()

    expect(GEOMETRIC_AVATAR_IDS).toContain(first.values.avatar)
    expect(second.values.avatar).toBe(first.values.avatar)
    expect(second.revision).toBe(first.revision)
  })

  it('backs up profile changes and rejects stale revisions without overwriting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-profile-'))
    const path = join(directory, 'profile.json')
    const repository = new UserProfileRepository(path, join(directory, 'avatars'))
    const initial = await repository.initialize()
    const nextAvatar = GEOMETRIC_AVATAR_IDS.find((avatar) => avatar !== initial.values.avatar)
    if (!nextAvatar) throw new Error('test avatar pool must contain more than one entry')
    const saved = await repository.save(initial.revision, nextAvatar)
    const source = await readFile(path, 'utf8')

    expect((await readdir(directory)).some((name) => name.startsWith('profile.json.bak-'))).toBe(true)
    await expect(repository.save(initial.revision, 'identicon-11')).rejects.toThrow('SETTINGS_CONFLICT')
    expect(await readFile(path, 'utf8')).toBe(source)
    expect(saved.values.avatar).toBe(nextAvatar)
  })

  it('stores a content-addressed custom avatar and returns it as a data URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-profile-'))
    const repository = new UserProfileRepository(join(directory, 'profile.json'), join(directory, 'avatars'))
    const initial = await repository.initialize()
    const png = Buffer.from('normalized-png-fixture')
    const hash = createHash('sha256').update(png).digest('hex')
    const saved = await repository.save(initial.revision, `user:${hash}`, png)

    expect(saved.values.avatar).toBe(`user:${hash}`)
    expect(saved.avatarDataUrl).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(await readFile(join(directory, 'avatars', `${hash}.png`))).toEqual(png)
  })

  it('reports damaged profile JSON instead of replacing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-profile-'))
    const path = join(directory, 'profile.json')
    await writeFile(path, '{broken')
    const repository = new UserProfileRepository(path, join(directory, 'avatars'))

    await expect(repository.initialize()).rejects.toThrow('CONFIG_INVALID')
    expect(await readFile(path, 'utf8')).toBe('{broken')
  })
})
