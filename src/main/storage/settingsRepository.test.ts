import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { SettingsRepository } from './settingsRepository'

const editable = {
  apiBaseUrl: 'https://user.test', provider: 'opencode-go', model: 'gpt-5.6-luna', thinkingLevel: 'high' as const,
  permissionMode: 'default' as const, theme: 'dark' as const, motion: 'auto' as const, sendImages: false,
  cacheControl: false, respondToBashCommands: true, shell: '',
  permissions: { allow: [], ask: [], deny: [] },
  share: { baseUrl: 'https://bingo.ruobin.dev' }
}

describe('SettingsRepository', () => {
  it('preserves unknown keys, creates a backup, and returns three-layer source metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-settings-'))
    const workspace = join(directory, 'workspace')
    const path = join(directory, 'settings.json')
    await mkdir(join(workspace, '.bingo'), { recursive: true })
    await writeFile(path, JSON.stringify({ unknown: { keep: true }, provider: 'old', apiKey: 'secret' }))
    await writeFile(join(workspace, '.bingo', 'settings.json'), JSON.stringify({ permissionMode: 'plan' }))
    const repository = new SettingsRepository(path)
    const before = await repository.read(workspace)

    expect(before.values.permissionMode).toBe('plan')
    expect(before.shadowed).toContain('permissionMode')
    const saved = await repository.save(workspace, before.revision, { ...editable, permissionMode: 'plan' })

    expect(saved.values.provider).toBe('opencode-go')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ unknown: { keep: true }, apiKey: 'secret', provider: 'opencode-go' })
    expect((await readdir(directory)).some((name) => name.startsWith('settings.json.bak-'))).toBe(true)
  })

  it('leaves invalid settings byte-identical', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-settings-'))
    const path = join(directory, 'settings.json')
    await writeFile(path, '{invalid')
    await expect(new SettingsRepository(path).read(directory)).rejects.toThrow(`Cannot read ${path}`)
    expect(await readFile(path, 'utf8')).toBe('{invalid')
  })

  it('rejects stale revisions without writing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-settings-'))
    const path = join(directory, 'settings.json')
    await writeFile(path, '{}')
    const repository = new SettingsRepository(path)
    await expect(repository.save(directory, 'stale', editable)).rejects.toThrow('SETTINGS_CONFLICT')
    expect(await readFile(path, 'utf8')).toBe('{}')
  })

  it('keeps provider and MCP secrets out of snapshots while preserving unchanged values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-settings-'))
    const path = join(directory, 'settings.json')
    await writeFile(path, JSON.stringify({
      providers: { private: { protocol: 'openai', apiBaseUrl: 'https://private.test', apiKey: 'provider-secret' } },
      mcpServers: { tools: { type: 'http', url: 'https://mcp.test', headers: { Authorization: 'header-secret' } } }
    }))
    const repository = new SettingsRepository(path)
    const before = await repository.read(directory)

    expect(JSON.stringify(before)).not.toContain('provider-secret')
    expect(JSON.stringify(before)).not.toContain('header-secret')
    expect(before.mcpServers?.[0]).toMatchObject({ name: 'tools', headerKeys: ['Authorization'] })

    const after = await repository.upsertProvider(directory, before.revision, {
      name: 'private', protocol: 'openai', apiBaseUrl: 'https://private.test', supportsImages: false,
      apiKey: { action: 'unchanged' }
    })
    expect(JSON.stringify(after)).not.toContain('provider-secret')
    expect(JSON.parse(await readFile(path, 'utf8')).providers.private.apiKey).toBe('provider-secret')
  })

  it('requires an atomic fallback when removing the active provider', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-settings-'))
    const path = join(directory, 'settings.json')
    await writeFile(path, JSON.stringify({
      provider: 'private', model: 'private-model',
      providers: { private: { protocol: 'openai', apiBaseUrl: 'https://private.test', apiKey: 'secret' } }
    }))
    const repository = new SettingsRepository(path)
    const before = await repository.read(directory)

    await expect(repository.removeProvider(directory, before.revision, 'private')).rejects.toThrow('Choose a fallback provider')
    const after = await repository.removeProvider(directory, before.revision, 'private', { provider: 'default', model: 'fallback-model' })
    expect(after.values).toMatchObject({ provider: 'default', model: 'fallback-model' })
    expect(JSON.parse(await readFile(path, 'utf8')).providers).toBeUndefined()
  })
})
