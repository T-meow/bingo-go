import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(
  process.env.BINGO_GUI_BUNDLE_BINARY
    ? process.env.BINGO_GUI_BUNDLE_BINARY
    : join(root, '..', 'bingo', 'target', 'release', 'bingo.exe')
)
const destination = join(root, 'resources', 'bin', 'win32-x64', 'bingo.exe')

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('The trial package is intentionally limited to win32-x64.')
}

const sourceStats = await stat(source)
if (!sourceStats.isFile() || sourceStats.size === 0) {
  throw new Error('The release Bingo executable is missing or empty: ' + source)
}

const version = execFileSync(source, ['--version'], {
  encoding: 'utf8',
  windowsHide: true
}).trim()
const probeOutput = execFileSync(source, ['--json-events', '--probe'], {
  encoding: 'utf8',
  windowsHide: true
}).trim()
const lines = probeOutput.split(/\r?\n/).filter(Boolean)
if (lines.length !== 1) {
  throw new Error('Bingo protocol probe must emit exactly one NDJSON record.')
}
const probe = JSON.parse(lines[0])
const capabilities = probe.metadata?.capabilities ?? probe.capabilities ?? []
if (
  probe.protocolVersion !== 1 ||
  probe.type !== 'protocol.ready' ||
  !capabilities.includes('settings.inspect.v1') ||
  !capabilities.includes('team.workspace.v1') ||
  !capabilities.includes('attachments.input.v1')
) {
  throw new Error('The Bingo executable does not expose the required protocol v1 capabilities.')
}

await mkdir(dirname(destination), { recursive: true })
await copyFile(source, destination)
const destinationStats = await stat(destination)
if (destinationStats.size !== sourceStats.size) {
  throw new Error('The bundled Bingo executable failed the size verification.')
}

console.log(JSON.stringify({
  source,
  destination,
  bytes: destinationStats.size,
  version,
  protocolVersion: probe.protocolVersion,
  capabilities
}, null, 2))
