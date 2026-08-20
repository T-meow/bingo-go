#!/usr/bin/env node
// Test fixture only. Simulates the side-effect-free `bingo app-server` probe
// used by packaging verification and black-box test scaffolding.
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('bingo 0.4.1\n')
  process.exit(0)
} else if (args.length === 1 && args[0] === 'app-server') {
  process.stdin.setEncoding('utf8')
  let buffer = ''
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) {
        const frame = JSON.parse(line)
        if (frame.method === 'initialize') {
          process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: frame.id,
            result: {
              protocol: { major: 1, minor: 0 },
              server: { name: 'bingo', version: '0.4.1', epoch: 'epoch_probe_fixture' },
              limits: { maxClientFrameBytes: 1_048_576, maxServerFrameBytes: 8_388_608 },
              capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true }
            }
          }) + '\n')
        } else if (frame.method === 'shutdown') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: { clean: true } }) + '\n')
          process.exit(0)
        }
      }
      newline = buffer.indexOf('\n')
    }
  })
} else {
  process.stderr.write(`probe-fixture: unsupported arguments: ${args.join(' ')}\n`)
  process.exit(2)
}
