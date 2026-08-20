import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { AppServerInspector } from './appServerInspector'

const fakeServer = join(process.cwd(), 'scripts', 'fake-app-server.mjs')

async function scenarioWithCatalog(catalog: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-inspector-'))
  const path = join(directory, 'scenario.json')
  await writeFile(path, JSON.stringify({
    initialize: {
      protocol: { major: 1, minor: 0 },
      server: { name: 'bingo-fake', version: '0.4.1', epoch: 'epoch_inspect' },
      limits: { maxClientFrameBytes: 1_048_576, maxServerFrameBytes: 8_388_608 },
      capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true }
    },
    requests: {
      'catalog/read': { result: { catalog } }
    }
  }))
  return path
}

describe('AppServerInspector', () => {
  it('serves providers and models from the pre-session catalog', async () => {
    const scenarioPath = await scenarioWithCatalog({
      catalog: 'providers',
      items: [{ name: 'default', protocol: 'anthropic', apiBaseUrl: 'https://api.example', builtin: true, credential: { state: 'unset', source: null }, supportsImages: true }],
      revision: 0
    })
    const inspector = new AppServerInspector(fakeServer, process.cwd(), { ...process.env, BINGO_FAKE_SCENARIO: scenarioPath })
    const metadata = await inspector.open()
    expect(metadata.bingoVersion).toBe('0.4.1')
    expect(metadata.epoch).toBe('epoch_inspect')
    await expect(inspector.listProviders()).resolves.toHaveLength(1)
    await inspector.close()
  })

  it('closes cleanly when the binary exits before shutdown', async () => {
    const scenarioPath = await scenarioWithCatalog({ catalog: 'models', items: [], revision: 0 })
    const inspector = new AppServerInspector(fakeServer, process.cwd(), { ...process.env, BINGO_FAKE_SCENARIO: scenarioPath })
    await inspector.open()
    await expect(inspector.close()).resolves.toBeUndefined()
  })
})
