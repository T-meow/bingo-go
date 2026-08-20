import { describe, expect, it } from 'vitest'
import { binaryCommand } from './binaryCommand'

describe('binaryCommand', () => {
  it('runs Windows command shims through ComSpec without enabling a shell in spawn', () => {
    expect(binaryCommand('C:\\Program Files\\Bingo\\bingo.cmd', ['app-server'], 'win32', 'C:\\Windows\\System32\\cmd.exe')).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', '""C:\\Program Files\\Bingo\\bingo.cmd" app-server"'],
      windowsVerbatimArguments: true
    })
  })

  it('runs JavaScript entry points with the current Node executable', () => {
    expect(binaryCommand('/opt/bingo.mjs', ['app-server'], 'linux')).toEqual({ command: process.execPath, args: ['/opt/bingo.mjs', 'app-server'] })
  })

  it('runs native binaries directly', () => {
    expect(binaryCommand('/opt/bingo', ['--probe'], 'linux')).toEqual({ command: '/opt/bingo', args: ['--probe'] })
  })
})
