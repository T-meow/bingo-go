import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledBingoPath } from './bundledBinary'

describe('bundledBingoPath', () => {
  it.each([
    ['win32', 'x64', join('resources', 'bin', 'win32-x64', 'bingo.exe')],
    ['darwin', 'x64', join('resources', 'bin', 'darwin-x64', 'bingo')],
    ['linux', 'x64', join('resources', 'bin', 'linux-x64', 'bingo')]
  ] as const)('maps %s-%s to its native packaged binary', (platform, arch, expected) => {
    expect(bundledBingoPath('resources', platform, arch)).toBe(expected)
  })
})
