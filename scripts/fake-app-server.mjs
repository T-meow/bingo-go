#!/usr/bin/env node
// Deterministic app-server double for tests. Reads a JSON scenario file whose
// shape is:
// {
//   "initialize": { ...InitializeResult },
//   "requests": { "<method>": { "result": ... } | { "error": { code, message, data? } } },
//   "notifications": [ { "method": "...", "params": { ... } } ],
//   "stderr": "optional diagnostic text"
// }
// The fake accepts initialize, answers configured requests in arrival order,
// emits configured notifications before each response by default, and exits 0
// after a clean shutdown request or stdin EOF.
import { readFileSync } from 'node:fs'

const scenarioPath = process.env.BINGO_FAKE_SCENARIO ?? process.argv[2]
if (!scenarioPath) {
  process.stderr.write('usage: fake-app-server.mjs <scenario.json>\n')
  process.exit(2)
}
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'))
const initialize = scenario.initialize ?? {
  jsonrpc: '2.0',
  protocol: { major: 1, minor: 0 },
  server: { name: 'bingo-fake', version: '0.0.0', epoch: 'epoch_test' },
  limits: { maxClientFrameBytes: 1_048_576, maxServerFrameBytes: 8_388_608 },
  capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true }
}
let seq = 1
const baseEvent = () => ({ seq: seq++, sessionId: 'sess_test', ts: Date.now() })

function emit(method, params) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let newline = buffer.indexOf('\n')
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (line) handle(JSON.parse(line))
    newline = buffer.indexOf('\n')
  }
})
process.stdin.on('end', () => process.exit(0))
if (scenario.stderr) process.stderr.write(scenario.stderr)

function handle(frame) {
  if (frame.method === 'initialized') return
  if (frame.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: initialize }) + '\n')
    return
  }
  if (frame.method === 'shutdown') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { clean: true } }) + '\n')
    process.exit(0)
    return
  }
  const configured = scenario.requests?.[frame.method]
  if (configured) {
    for (const notification of scenario.notifications ?? []) {
      emit(notification.method, { event: { ...baseEvent(), ...(notification.params?.event ?? {}) }, ...(notification.params ?? {}) })
    }
    if (configured.error) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, error: configured.error }) + '\n')
    } else {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: configured.result ?? {} }) + '\n')
    }
    return
  }
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id: frame.id,
    error: { code: -32601, message: 'Method not found', data: { bingoCode: 'METHOD_NOT_FOUND', recoverable: false, scope: 'request' } }
  }) + '\n')
}
