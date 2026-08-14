import { describe, expect, it } from 'vitest'
import { BUILTIN_AVATAR_IDS, GEOMETRIC_AVATAR_IDS, LEGACY_AVATAR_IDS, availableGeometricAvatarIds, stableGeometricAvatarId } from './avatars'

describe('avatar catalog', () => {
  it('keeps the legacy ids first and exposes twelve geometric defaults', () => {
    expect(BUILTIN_AVATAR_IDS.slice(0, LEGACY_AVATAR_IDS.length)).toEqual(LEGACY_AVATAR_IDS)
    expect(GEOMETRIC_AVATAR_IDS).toHaveLength(12)
    expect(new Set(BUILTIN_AVATAR_IDS).size).toBe(20)
  })

  it('uses a stable geometric fallback and prefers unused defaults', () => {
    expect(stableGeometricAvatarId('reviewer')).toBe(stableGeometricAvatarId('reviewer'))
    expect(GEOMETRIC_AVATAR_IDS).toContain(stableGeometricAvatarId('旧成员'))
    expect(availableGeometricAvatarIds(GEOMETRIC_AVATAR_IDS.slice(0, 11))).toEqual([GEOMETRIC_AVATAR_IDS[11]])
  })
})
