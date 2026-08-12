import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { RuntimeLocator } from './runtimeLocator'

async function fixture(body: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bingo-go-probe-'))
  const path = join(directory, 'bingo.mjs')
  await writeFile(path, `#!/usr/bin/env node\n${body}`)
  await chmod(path, 0o755)
  return path
}

describe('RuntimeLocator probe', () => {
  it('uses side-effect-free probe and returns its version', async () => {
    const binary = await fixture(`
if (process.argv.slice(2).join(' ') !== '--json-events --probe') process.exit(9)
console.log(JSON.stringify({protocolVersion:1,seq:1,sessionId:null,type:'protocol.ready',bingoVersion:'0.4.0'}))
`)
    const result = await new RuntimeLocator({ env: { ...process.env, BINGO_GUI_BINARY: binary } }).probe(process.cwd())
    expect(result).toMatchObject({ ok: true, value: { bingoVersion: '0.4.0', protocolVersion: 1, workspacePath: process.cwd() } })
    if (result.ok) expect(result.value.binaryPath.replaceAll('\\', '/')).toMatch(/bingo-go-probe-.+\/bingo\.mjs$/)
  })

  it('rejects extra probe events', async () => {
    const record = JSON.stringify({ protocolVersion: 1, seq: 1, sessionId: null, type: 'protocol.ready', bingoVersion: '0.4.0' })
    const binary = await fixture(`console.log(${JSON.stringify(record)}); console.log(${JSON.stringify(record)})`)
    const result = await new RuntimeLocator({ env: { ...process.env, BINGO_GUI_BINARY: binary } }).probe(process.cwd())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('BINGO_PROTOCOL_UNSUPPORTED')
  })

  it('uses a packaged binary when no explicit override is configured', async () => {
    const binary = await fixture(`console.log(JSON.stringify({protocolVersion:1,seq:1,sessionId:null,type:'protocol.ready',bingoVersion:'0.4.0',capabilities:['team.workspace.v1']}))`)
    const result = await new RuntimeLocator({ env: { PATH: '' }, bundledBinary: binary }).probe(process.cwd())
    expect(result).toMatchObject({ ok: true, value: { binaryPath: binary, capabilities: ['team.workspace.v1'] } })
  })

  it.runIf(process.platform === 'win32')('probes a .cmd shim from a path containing spaces', async () => {
    const directory = join(await mkdtemp(join(tmpdir(), 'bingo-go-cmd-')), 'path with spaces')
    await mkdir(directory)
    const script = join(directory, 'bingo.mjs')
    const shim = join(directory, 'bingo.cmd')
    await writeFile(script, `if (process.argv.slice(2).join(' ') !== '--json-events --probe') process.exit(9)\nconsole.log(JSON.stringify({protocolVersion:1,seq:1,sessionId:null,type:'protocol.ready',bingoVersion:'0.4.0'}))\n`)
    await writeFile(shim, `@echo off\r\n"${process.execPath}" "%~dp0bingo.mjs" %*\r\n`)

    const result = await new RuntimeLocator({ env: { ...process.env, BINGO_GUI_BINARY: shim } }).probe(process.cwd())

    expect(result).toMatchObject({ ok: true, value: { bingoVersion: '0.4.0', protocolVersion: 1 } })
  })
})
