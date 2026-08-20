import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { AppServerCommandError, AppServerConnection } from './appServerConnection'

const fakeServer = join(process.cwd(), 'scripts', 'fake-app-server.mjs')

type Scenario = {
  initialize?: Record<string, unknown>
  requests?: Record<string, { result?: unknown; error?: unknown }>
  notifications?: Array<{ method: string; params?: Record<string, unknown> }>
  stderr?: string
}

async function writeScenario(name: string, scenario: Scenario): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-app-server-'))
  const path = join(directory, `${name}.json`)
  await writeFile(path, JSON.stringify(scenario))
  return path
}

function handlers() {
  return { notifications: vi.fn(), desyncs: vi.fn(), exits: vi.fn() }
}

describe('AppServerConnection', () => {
  it('initializes, correlates requests, forwards notifications, and shuts down cleanly', async () => {
    const scenarioPath = await writeScenario('basic', {
      initialize: {
        protocol: { major: 1, minor: 0 },
        server: { name: 'bingo-fake', version: '0.0.0', epoch: 'epoch_test' },
        limits: { maxClientFrameBytes: 1_048_576, maxServerFrameBytes: 8_388_608 },
        capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true }
      },
      requests: { 'session/list': { result: { sessions: [], revision: 0 } } },
      notifications: [{ method: 'session/updated', params: { session: { id: 'sess_test', title: 'Test', state: 'active' } } }]
    })
    const observed = handlers()
    const connection = new AppServerConnection(fakeServer, process.cwd(), {
      onNotification: observed.notifications,
      onDesync: observed.desyncs,
      onExit: observed.exits
    }, { ...process.env, BINGO_FAKE_SCENARIO: scenarioPath })

    const initialized = await connection.start()
    expect(initialized.server.version).toBe('0.0.0')
    expect(connection.connectionState).toBe('ready')
    await expect(connection.request('session/list', {})).resolves.toEqual({ sessions: [], revision: 0 })
    expect(observed.notifications).toHaveBeenCalledWith(expect.objectContaining({ method: 'session/updated' }))
    await connection.shutdown()
    await vi.waitFor(() => expect(observed.exits).toHaveBeenCalled())
  })

  it('maps JSON-RPC errors to AppServerCommandError with stable bingo codes', async () => {
    const scenarioPath = await writeScenario('error', {
      requests: {
        'session/start': {
          error: {
            code: -32005,
            message: 'No session is open on this connection.',
            data: { bingoCode: 'NO_ACTIVE_SESSION', recoverable: true, scope: 'session' }
          }
        }
      }
    })
    const connection = new AppServerConnection(fakeServer, process.cwd(), {
      onNotification: () => undefined,
      onDesync: () => undefined,
      onExit: () => undefined
    }, { ...process.env, BINGO_FAKE_SCENARIO: scenarioPath })
    await connection.start()
    const error = await connection.request('session/start', { cwd: null, model: null, permissionMode: null, provider: null, thinking: null }).then(() => null, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(AppServerCommandError)
    if (error instanceof AppServerCommandError) {
      expect(error.code).toBe('NO_ACTIVE_SESSION')
      expect(error.scope).toBe('session')
      expect(error.recoverable).toBe(true)
    }
    await connection.shutdown()
  })

  it('fails a server frame that exceeds the negotiated ceiling', async () => {
    const scenarioPath = await writeScenario('server-oversize', {
      initialize: {
        protocol: { major: 1, minor: 0 },
        server: { name: 'bingo-fake', version: '0.0.0', epoch: 'epoch_test' },
        limits: { maxClientFrameBytes: 1_048_576, maxServerFrameBytes: 64 },
        capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true }
      },
      requests: { 'session/list': { result: {} } },
      notifications: [{ method: 'session/updated', params: { session: { id: 'sess_test', title: 'x'.repeat(200), state: 'active' } } }]
    })
    const observed = handlers()
    const connection = new AppServerConnection(fakeServer, process.cwd(), {
      onNotification: observed.notifications,
      onDesync: observed.desyncs,
      onExit: observed.exits
    }, { ...process.env, BINGO_FAKE_SCENARIO: scenarioPath })
    await connection.start()
    await expect(connection.request('session/list', {})).rejects.toThrow('server frame exceeds')
    await vi.waitFor(() => expect(observed.exits).toHaveBeenCalled())
  })

  it('refuses client frames above the negotiated ceiling before writing them', async () => {
    const scenarioPath = await writeScenario('client-oversize', {
      initialize: {
        protocol: { major: 1, minor: 0 },
        server: { name: 'bingo-fake', version: '0.0.0', epoch: 'epoch_test' },
        limits: { maxClientFrameBytes: 128, maxServerFrameBytes: 8_388_608 },
        capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true }
      },
      requests: { 'session/list': { result: {} } }
    })
    const connection = new AppServerConnection(fakeServer, process.cwd(), {
      onNotification: () => undefined,
      onDesync: () => undefined,
      onExit: () => undefined
    }, { ...process.env, BINGO_FAKE_SCENARIO: scenarioPath })
    await connection.start()
    await expect(connection.request('session/list', { cursor: 'x'.repeat(256) } as never)).rejects.toThrow('client frame exceeds')
  })

  it('reports sequence gaps instead of applying events out of order', async () => {
    const scenarioPath = await writeScenario('gap', {
      requests: { 'session/list': { result: { sessions: [], revision: 0 } } },
      notifications: [
        { method: 'session/updated', params: { event: { seq: 1, sessionId: 'sess_test', ts: 1 }, session: {} } },
        { method: 'session/updated', params: { event: { seq: 5, sessionId: 'sess_test', ts: 5 }, session: {} } }
      ]
    })
    const observed = handlers()
    const connection = new AppServerConnection(fakeServer, process.cwd(), {
      onNotification: observed.notifications,
      onDesync: observed.desyncs,
      onExit: observed.exits
    }, { ...process.env, BINGO_FAKE_SCENARIO: scenarioPath })
    await connection.start()
    await connection.request('session/list', {})
    expect(observed.desyncs).toHaveBeenCalledWith({ expectedSeq: 2, actual: 5 })
    expect(observed.notifications).toHaveBeenCalledTimes(1)
    await connection.shutdown()
  })
})
