import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { RuntimeLocator } from './runtimeLocator'

const fakeServer = join(process.cwd(), 'scripts', 'fake-app-server.mjs')

async function fixture(body: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-probe-'))
  const path = join(directory, 'bingo.mjs')
  await writeFile(path, `#!/usr/bin/env node\n${body}`)
  await chmod(path, 0o755)
  return path
}

async function scenarioPath(name: string, initialize: Record<string, unknown> = {}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-probe-scenario-'))
  const path = join(directory, `${name}.json`)
  await writeFile(path, JSON.stringify({
    initialize: {
      protocol: { major: 1, minor: 0 },
      server: { name: 'bingo-fake', version: '0.4.1', epoch: 'epoch_probe' },
      limits: { maxClientFrameBytes: 1_048_576, maxServerFrameBytes: 8_388_608 },
      capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true },
      ...initialize
    }
  }))
  return path
}

describe('RuntimeLocator probe', () => {
  it('uses the app-server initialize handshake and returns its capabilities', async () => {
    const scenario = await scenarioPath('basic')
    const result = await new RuntimeLocator({
      env: { ...process.env, BINGO_GUI_BINARY: fakeServer, BINGO_FAKE_SCENARIO: scenario }
    }).probe(process.cwd())
    expect(result).toMatchObject({
      ok: true,
      value: {
        bingoVersion: '0.4.1',
        workspacePath: process.cwd(),
        appServer: {
          protocol: { major: 1, minor: 0 },
          capabilities: { teams: true }
        }
      }
    })
  })

  it('rejects binaries that do not speak the app-server protocol', async () => {
    const binary = await fixture(`console.log('not an app-server frame')`)
    const result = await new RuntimeLocator({ env: { ...process.env, BINGO_GUI_BINARY: binary } }).probe(process.cwd())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('BINGO_PROTOCOL_UNSUPPORTED')
  })

  it('uses a packaged binary when no explicit override is configured', async () => {
    const scenario = await scenarioPath('bundled')
    const result = await new RuntimeLocator({
      env: { PATH: '', BINGO_FAKE_SCENARIO: scenario },
      bundledBinary: fakeServer
    }).probe(process.cwd())
    expect(result).toMatchObject({ ok: true, value: { binaryPath: fakeServer, bingoVersion: '0.4.1' } })
  })

  it('rejects a file path as a workspace before starting a session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingo-go-workspace-file-'))
    const workspaceFile = join(directory, 'index.html')
    await writeFile(workspaceFile, '<!doctype html>')
    const scenario = await scenarioPath('workspace-file')
    const result = await new RuntimeLocator({
      env: { ...process.env, BINGO_GUI_BINARY: fakeServer, BINGO_FAKE_SCENARIO: scenario }
    }).probe(workspaceFile)
    expect(result).toMatchObject({ ok: false, error: { code: 'BAD_ARGUMENT' } })
    if (!result.ok) expect(result.error.msg).toContain('not a directory')
  })

  it.runIf(process.platform === 'win32')('probes a .cmd shim from a path containing spaces', async () => {
    const directory = join(await mkdtemp(join(tmpdir(), 'bingo-go-cmd-')), 'path with spaces')
    await mkdir(directory)
    const shim = join(directory, 'bingo.cmd')
    const scenario = await scenarioPath('cmd')
    await writeFile(shim, '@echo off\r\n' + `"${process.execPath}" "${fakeServer}" %*` + '\r\n')
    const result = await new RuntimeLocator({
      env: { ...process.env, BINGO_GUI_BINARY: shim, BINGO_FAKE_SCENARIO: scenario }
    }).probe(process.cwd())
    if (!result.ok) throw new Error(`cmd probe failed: ${JSON.stringify(result)}`)
    expect(result.value).toMatchObject({ bingoVersion: '0.4.1' })
  })
})
