export const LEGACY_AVATAR_IDS = [
  'emi', 'kenji', 'sora', 'mika', 'taro', 'jin', 'kai', 'rio'
] as const

export const GEOMETRIC_AVATAR_IDS = [
  'identicon-01', 'identicon-02', 'identicon-03', 'identicon-04',
  'identicon-05', 'identicon-06', 'identicon-07', 'identicon-08',
  'identicon-09', 'identicon-10', 'identicon-11', 'identicon-12'
] as const

export const BUILTIN_AVATAR_IDS = [...LEGACY_AVATAR_IDS, ...GEOMETRIC_AVATAR_IDS] as const

export type BuiltinAvatarId = (typeof BUILTIN_AVATAR_IDS)[number]

export function isBuiltinAvatarId(value: string): value is BuiltinAvatarId {
  return (BUILTIN_AVATAR_IDS as readonly string[]).includes(value)
}

export function stableGeometricAvatarId(identity: string): (typeof GEOMETRIC_AVATAR_IDS)[number] {
  let hash = 0
  for (const character of identity) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0
  return GEOMETRIC_AVATAR_IDS[hash % GEOMETRIC_AVATAR_IDS.length]
}

export function availableGeometricAvatarIds(taken: Iterable<string>): readonly (typeof GEOMETRIC_AVATAR_IDS)[number][] {
  const unavailable = new Set(taken)
  const available = GEOMETRIC_AVATAR_IDS.filter((id) => !unavailable.has(id))
  return available.length > 0 ? available : GEOMETRIC_AVATAR_IDS
}
