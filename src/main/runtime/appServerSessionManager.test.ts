import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { AppServerSessionManager } from './appServerSessionManager'

const fakeServer = join(process.cwd(), 'scripts', 'fake-app-server.mjs')

async function scenario(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-manager-'))
  const path = join(directory, 'scenario.json')
  const snapshot = {
    session: { id: 'sess_1', epoch: 'epoch_1' },
    conversations: { active: [], count: 0, revision: 1 },
    collections: { agents: { active: [], count: 0, revision: 1 }, rooms: { active: [], count: 0, revision: 1 }, tasks: { active: [], count: 0, revision: 1 }, deliveries: { active: [], count: 0, revision: 1 }, backgroundCommands: { active: [], count: 0, revision: 1 }, mcpServers: [] },
    config: {}, activeTurns: [], interactions: [], operations: [], feedback: [], capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true }, eventCursor: 1
  }
  await writeFile(path, JSON.stringify({
    requests: {
      'session/start': { result: { snapshot } },
      'session/read': { result: { snapshot } },
      'conversation/read': { result: { snapshot: { conversation: { id: 'conv_main' }, items: { items: [], revision: 1 }, queue: { items: [], revision: 1 }, interactions: [], historyGeneration: 1, eventCursor: 2 } } },
      'conversation/submit': { result: { disposition: { type: 'turnStarted', turnId: 'turn_1' } } },
      'turn/interrupt': { result: { accepted: true, turnId: 'turn_1' } },
      'session/close': { result: { sessionId: 'sess_1' } }
    },
    notifications: [{ method: 'session/updated', params: { session: { id: 'sess_1', epoch: 'epoch_1' } } }]
  }))
  return path
}

describe('AppServerSessionManager', () => {
  it('starts a session, forwards notifications, and resynchronizes on demand', async () => {
    const path = await scenario()
    const handlers = { onSnapshot: vi.fn(), onNotification: vi.fn(), onDesync: vi.fn(), onExit: vi.fn() }
    const manager = new AppServerSessionManager(fakeServer, process.cwd(), handlers, { ...process.env, BINGO_FAKE_SCENARIO: path })
    const snapshot = await manager.start()
    expect(snapshot.session.epoch).toBe('epoch_1')
    expect(handlers.onSnapshot).toHaveBeenCalledTimes(1)
    await manager.conversationRead({ conversationId: 'conv_main' })
    expect(handlers.onNotification).toHaveBeenCalledWith(expect.objectContaining({ method: 'session/updated' }))
    await expect(manager.composerSubmit('conv_main', 'hello')).resolves.toMatchObject({ disposition: { type: 'turnStarted' } })
    await expect(manager.turnInterrupt({ conversationId: 'conv_main', turnId: 'turn_1' })).resolves.toEqual({ accepted: true, turnId: 'turn_1' })
    await expect(manager.sessionRead()).resolves.toMatchObject({ session: { epoch: 'epoch_1' } })
    await manager.close()
  })
})
