import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { AppServerSession } from './appServerSession'

const fakeServer = join(process.cwd(), 'scripts', 'fake-app-server.mjs')

async function scenario(requests: Record<string, { result?: unknown; error?: unknown }>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-session-api-'))
  const path = join(directory, 'scenario.json')
  await writeFile(path, JSON.stringify({ requests }))
  return path
}

function open(path: string): AppServerSession {
  return new AppServerSession(fakeServer, process.cwd(), {
    onNotification: vi.fn(),
    onDesync: vi.fn(),
    onExit: vi.fn()
  }, { ...process.env, BINGO_FAKE_SCENARIO: path })
}

describe('AppServerSession high-level methods', () => {
  it('exposes the P3-P5 request surface through one typed facade', async () => {
    const path = await scenario({
      'session/start': { result: { snapshot: { session: { id: 'sess_1', epoch: 'epoch_1' } } } },
      'conversation/read': { result: { snapshot: { conversation: { id: 'conv_main' } } } },
      'conversation/submit': { result: { disposition: { type: 'turnStarted', turnId: 'turn_1' } } },
      'turn/interrupt': { result: { accepted: true, turnId: 'turn_1' } },
      'queue/read': { result: { page: { items: [], revision: 1 } } },
      'interaction/respond': { result: { status: 'accepted' } },
      'action/list': { result: { actions: [], revision: 1 } },
      'config/read': { result: { config: { provider: 'default' } } },
      'catalog/read': { result: { catalog: { catalog: 'models', items: [], revision: 1 } } },
      'resource/read': { result: { page: { resource: 'agents', items: [], revision: 1 } } },
      'asset/registerPath': { result: { asset: { id: 'asset_1', bytes: 1 } } },
      'asset/readChunk': { result: { chunk: 'YQ==', nextOffset: null, eof: true } },
      'session/delete': { result: { deleted: true, locator: { type: 'latest' } } }
    })
    const session = open(path)
    await session.open()
    await expect(session.sessionStart({ cwd: '/tmp' })).resolves.toMatchObject({ snapshot: { session: { id: 'sess_1' } } })
    await expect(session.conversationRead({ conversationId: 'conv_main' })).resolves.toMatchObject({ snapshot: { conversation: { id: 'conv_main' } } })
    await expect(session.conversationSubmit({ conversationId: 'conv_main', input: { type: 'composer', mode: 'normal', text: 'hi', attachments: [] } })).resolves.toMatchObject({ disposition: { type: 'turnStarted' } })
    await expect(session.turnInterrupt({ conversationId: 'conv_main', turnId: 'turn_1' })).resolves.toMatchObject({ accepted: true })
    await expect(session.interactionRespond({ interactionId: 'int_1', activation: 'pointer', decision: { type: 'allowOnce' } })).resolves.toEqual({ status: 'accepted' })
    await expect(session.actionList({})).resolves.toMatchObject({ actions: [] })
    await expect(session.configRead({})).resolves.toMatchObject({ config: { provider: 'default' } })
    await expect(session.catalogRead({ catalog: 'models', provider: 'default' })).resolves.toMatchObject({ catalog: { catalog: 'models' } })
    await expect(session.resourceRead({ resource: 'agents' })).resolves.toMatchObject({ page: { resource: 'agents' } })
    await expect(session.assetRegisterPath({ path: '/tmp/a.png' })).resolves.toMatchObject({ asset: { id: 'asset_1' } })
    await expect(session.assetReadChunk({ assetId: 'asset_1', offset: 0, length: 10 })).resolves.toMatchObject({ eof: true })
    await expect(session.sessionDelete({ locator: { type: 'latest' } })).resolves.toMatchObject({ deleted: true })
    await session.shutdown()
  })
})
