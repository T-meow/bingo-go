import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'

export const BINGO_VERSION = 'bingo 0.4.0'
export const REQUIRED_CAPABILITIES = [
  'settings.inspect.v1',
  'team.workspace.v1',
  'team.tasks.v1',
  'team.blueprint.v2',
  'team.lobby.v1',
  'team.presets.v1',
  'team.member.profile.v1',
  'attachments.input.v1',
  'session.workspace.v1',
  'session.context.v1'
]

export function inspectBingo(binaryPath) {
  const version = execFileSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    windowsHide: true
  }).trim()
  if (version !== BINGO_VERSION) {
    throw new Error(`Expected ${BINGO_VERSION}, received ${version || '<empty>'}.`)
  }

  const output = execFileSync(binaryPath, ['--json-events', '--probe'], {
    encoding: 'utf8',
    windowsHide: true
  }).trim()
  const lines = output.split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) {
    throw new Error('Bingo protocol probe must emit exactly one NDJSON record.')
  }

  const probe = JSON.parse(lines[0])
  const capabilities = probe.metadata?.capabilities ?? probe.capabilities ?? []
  const missing = REQUIRED_CAPABILITIES.filter((capability) => !capabilities.includes(capability))
  if (probe.protocolVersion !== 1 || probe.type !== 'protocol.ready' || missing.length > 0) {
    throw new Error(`Bingo does not expose the required protocol v1 capabilities. Missing: ${missing.join(', ') || '<protocol>'}.`)
  }

  return { version, protocolVersion: probe.protocolVersion, capabilities }
}

export async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
