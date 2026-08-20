import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'

export const BINGO_VERSION = 'bingo 0.4.1'
export const REQUIRED_SERVER_CAPABILITIES = ['images', 'multiConversation', 'reasoning', 'rooms', 'shell', 'teams']

export function inspectBingo(binaryPath) {
  const version = execFileSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    windowsHide: true
  }).trim()
  if (version !== BINGO_VERSION) {
    throw new Error(`Expected ${BINGO_VERSION}, received ${version || '<empty>'}.`)
  }

  const input = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocol: { major: 1, minMinor: 0, maxMinor: 0 },
      client: { name: 'bingo-go-verify', version: '0.1.0' },
      capabilities: { interactionResponse: true }
    } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown', params: {} })
  ].join('\n') + '\n'

  const probe = spawnSync(binaryPath, ['app-server'], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024
  })
  if (probe.status !== 0) {
    throw new Error(`bingo app-server exited ${probe.status}: ${probe.stderr || probe.stdout || '<no output>'}`)
  }
  const lines = probe.stdout.split(/\r?\n/).filter(Boolean)
  const initializeResponse = lines.find((line) => {
    try { return JSON.parse(line).id === 1 } catch { return false }
  })
  if (!initializeResponse) {
    throw new Error('Bingo app-server probe did not emit an initialize response.')
  }
  const initialized = JSON.parse(initializeResponse)
  if (initialized.jsonrpc !== '2.0' || !initialized.result?.server?.version || !initialized.result?.protocol || !initialized.result?.limits || !initialized.result?.capabilities) {
    throw new Error('Bingo app-server probe returned an invalid initialize result.')
  }
  const capabilities = initialized.result.capabilities
  const missing = REQUIRED_SERVER_CAPABILITIES.filter((capability) => capabilities[capability] !== true)
  if (missing.length > 0) {
    throw new Error(`Bingo does not expose required app-server capabilities. Missing: ${missing.join(', ')}.`)
  }
  return {
    version,
    protocol: initialized.result.protocol,
    serverCapabilities: capabilities,
    limits: initialized.result.limits
  }
}

export async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
