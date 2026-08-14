import { describe, expect, it } from 'vitest'
import { isKnownPackageOutput } from './reset-package-output.mjs'

const version = '0.1.0'
const directory = (name) => ({ name, isDirectory: () => true, isFile: () => false })
const file = (name) => ({ name, isDirectory: () => false, isFile: () => true })
const special = (name) => ({ name, isDirectory: () => false, isFile: () => false })

describe('release output reset policy', () => {
  it('allows only known unpacked directories', () => {
    expect(isKnownPackageOutput(directory('win-unpacked'), version)).toBe(true)
    expect(isKnownPackageOutput(directory('linux-unpacked'), version)).toBe(true)
    expect(isKnownPackageOutput(directory('mac'), version)).toBe(true)
    expect(isKnownPackageOutput(directory('manual-backup'), version)).toBe(false)
  })

  it('allows exact current-version artifacts and metadata', () => {
    expect(isKnownPackageOutput(file('Bingo-Go-0.1.0-win-x64.exe'), version)).toBe(true)
    expect(isKnownPackageOutput(file('Bingo-Go-0.1.0-win-x64.exe.blockmap'), version)).toBe(true)
    expect(isKnownPackageOutput(file('Bingo-Go-0.1.0-mac-x64.dmg'), version)).toBe(true)
    expect(isKnownPackageOutput(file('Bingo-Go-0.1.0-linux-x64.AppImage'), version)).toBe(true)
    expect(isKnownPackageOutput(file('latest.yml'), version)).toBe(true)
    expect(isKnownPackageOutput(file('latest-mac.yml'), version)).toBe(true)
    expect(isKnownPackageOutput(file('SHA256SUMS-win32-x64.txt'), version)).toBe(true)
  })

  it('rejects unknown, stale-version and special entries', () => {
    expect(isKnownPackageOutput(file('notes.zip'), version)).toBe(false)
    expect(isKnownPackageOutput(file('Bingo-Go-0.0.9-win-x64.exe'), version)).toBe(false)
    expect(isKnownPackageOutput(file('SHA256SUMS-custom.txt'), version)).toBe(false)
    expect(isKnownPackageOutput(special('Bingo-Go-0.1.0-win-x64.exe'), version)).toBe(false)
  })
})
