import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { AppServerSessionManager } from './appServerSessionManager'
import { AppServerActionService } from './appServerActionService'
import { AppServerAssetService } from './appServerAssetService'

const fakeServer = join(process.cwd(), 'scripts', 'fake-app-server.mjs')

async function scenario(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-p5-'))
  const path = join(directory, 'scenario.json')
  await writeFile(path, JSON.stringify({
    requests: {
      'session/start': { result: { snapshot: {
        session: { id: 'sess_1', epoch: 'epoch_1', cwd: '/tmp', title: 'T', state: 'active', resumed: false },
        conversations: { active: [{ id: 'conv_main', kind: { type: 'main' }, title: 'Main', runState: 'idle', historyGeneration: 1, isMember: true, unread: 0, mentions: 0, obligations: [], pendingInteractions: 0, queueCount: 0, queueRevision: 1, revision: 1, lastActivityAt: 0, lastItemId: null, readCursor: null, activeTurnId: null }], count: 1, revision: 1 },
        collections: { agents: { active: [], count: 0, revision: 1 }, rooms: { active: [], count: 0, revision: 1 }, tasks: { active: [], count: 0, revision: 1 }, deliveries: { active: [], count: 0, revision: 1 }, backgroundCommands: { active: [], count: 0, revision: 1 }, mcpServers: [] },
        config: { cwd: '/tmp', provider: 'default', model: 'model', thinking: 'off', permissionMode: 'default', theme: 'dark', shell: 'sh', shellDialect: 'posix', permissions: [], mcpServers: [], layers: [], revision: 1 },
        capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true },
        activeTurns: [], interactions: [], operations: [], feedback: [], eventCursor: 1
      } } },
      'asset/registerPath': { result: { asset: { id: 'asset_1', bytes: 2, kind: 'image', mime: 'image/png', origin: 'session', sha256: 'aa', createdAt: 0, width: null, height: null } } },
      'asset/readChunk': { result: { data: 'YQ==', nextOffset: 1, eof: true } },
      'action/execute': { result: { disposition: { type: 'applied', result: { status: 'applied', message: 'ok', revision: null } } } }
    }
  }))
  return path
}

describe('app-server P5 services', () => {
  it('registers and reads assets through chunked base64 requests', async () => {
    const path = await scenario()
    const manager = new AppServerSessionManager(fakeServer, process.cwd(), {
      onSnapshot: vi.fn(), onNotification: vi.fn(), onDesync: vi.fn(), onExit: vi.fn()
    }, { ...process.env, BINGO_FAKE_SCENARIO: path })
    await manager.start()
    const assets = new AppServerAssetService(manager)
    await expect(assets.registerPath('/tmp/image.png', 'image/png')).resolves.toMatchObject({ id: 'asset_1', mime: 'image/png' })
    await expect(assets.readDataUrl('asset_1', 'image/png')).resolves.toBe('data:image/png;base64,YQ==')
    await manager.close()
  })

  it('executes runtime selection actions through action/execute', async () => {
    const path = await scenario()
    const manager = new AppServerSessionManager(fakeServer, process.cwd(), {
      onSnapshot: vi.fn(), onNotification: vi.fn(), onDesync: vi.fn(), onExit: vi.fn()
    }, { ...process.env, BINGO_FAKE_SCENARIO: path })
    await manager.start()
    const actions = new AppServerActionService(manager)
    await expect(actions.setModel('conv_main', 'model-2')).resolves.toMatchObject({ disposition: { type: 'applied' } })
    await expect(actions.setThinking('conv_main', 'high')).resolves.toMatchObject({ disposition: { type: 'applied' } })
    await expect(actions.rewind('conv_main', { type: 'item', itemId: 'item_1' }, 'preview')).resolves.toMatchObject({ disposition: { type: 'applied' } })
    await manager.close()
  })
})
