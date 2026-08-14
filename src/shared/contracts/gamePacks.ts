import { z } from 'zod'

export const GAME_PACK_LIMITS = {
  archiveBytes: 10 * 1024 * 1024,
  extractedBytes: 25 * 1024 * 1024,
  entries: 256,
  fileBytes: 8 * 1024 * 1024,
  manifestBytes: 64 * 1024,
  iconBytes: 256 * 1024
} as const

const versionPart = '(?:0|[1-9][0-9]{0,5})'
export const gamePackVersionSchema = z.string().regex(new RegExp(`^${versionPart}\\.${versionPart}\\.${versionPart}$`), 'version must use numeric MAJOR.MINOR.PATCH')
export const gamePackIdSchema = z.string().min(3).max(255).regex(
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
  'id must use lowercase reverse-DNS format'
)

export function isSafeGamePackPath(value: string): boolean {
  if (!value || value.length > 1_024 || value.includes('\\') || /[\u0000-\u001f<>:"|?*#%]/.test(value) || value.startsWith('/')) return false
  return value.split('/').every((segment) => {
    if (!segment || segment === '.' || segment === '..' || /[. ]$/.test(segment)) return false
    const stem = segment.split('.')[0].toLowerCase()
    return !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(stem)
  })
}

export const gamePackRelativePathSchema = z.string().max(1_024).refine(isSafeGamePackPath, 'path must be a safe package-relative POSIX path')

export const gamePackWindowSchema = z.object({
  width: z.number().int().min(320).max(1_600),
  height: z.number().int().min(320).max(1_200),
  minWidth: z.number().int().min(280).max(1_600),
  minHeight: z.number().int().min(280).max(1_200),
  resizable: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.minWidth > value.width) context.addIssue({ code: 'custom', path: ['minWidth'], message: 'minWidth cannot exceed width' })
  if (value.minHeight > value.height) context.addIssue({ code: 'custom', path: ['minHeight'], message: 'minHeight cannot exceed height' })
})

export const gamePackManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('game'),
  id: gamePackIdSchema,
  name: z.string().trim().min(1).max(80),
  version: gamePackVersionSchema,
  entry: gamePackRelativePathSchema.refine((value) => value.toLowerCase().endsWith('.html'), 'entry must be an HTML file'),
  description: z.string().trim().max(500).optional(),
  author: z.string().trim().max(120).optional(),
  icon: gamePackRelativePathSchema.refine((value) => /\.(?:png|webp)$/i.test(value), 'icon must be PNG or WebP').optional(),
  window: gamePackWindowSchema
}).strict()

export type GamePackManifestV1 = z.infer<typeof gamePackManifestV1Schema>
export const gamePackSha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'value must be a lowercase SHA-256 digest')
export const gamePackSourceSchema = z.enum(['builtin', 'external'])
export const gamePackStatusSchema = z.enum(['ready', 'invalid'])
export const gamePackVersionRelationSchema = z.enum(['new', 'upgrade', 'same', 'downgrade'])

export const gamePackItemSchema = z.object({
  manifest: gamePackManifestV1Schema,
  source: gamePackSourceSchema,
  enabled: z.boolean(),
  status: gamePackStatusSchema,
  sha256: gamePackSha256Schema,
  installedAt: z.string().datetime().optional(),
  error: z.string().max(2_000).optional()
}).strict().superRefine((value, context) => {
  if (value.source === 'external' && !value.installedAt) context.addIssue({ code: 'custom', path: ['installedAt'], message: 'external packages require an installation timestamp' })
  if (value.source === 'builtin' && value.installedAt) context.addIssue({ code: 'custom', path: ['installedAt'], message: 'built-in packages cannot have an installation timestamp' })
  if (value.status === 'invalid' && !value.error) context.addIssue({ code: 'custom', path: ['error'], message: 'invalid packages require an error message' })
  if (value.status === 'ready' && value.error) context.addIssue({ code: 'custom', path: ['error'], message: 'ready packages cannot have an error message' })
})

export const gamePackSnapshotSchema = z.object({
  revision: gamePackSha256Schema,
  items: z.array(gamePackItemSchema),
  warnings: z.array(z.string().max(2_000))
}).strict()

export const gamePackImportPreviewSchema = z.object({
  token: z.string().uuid(),
  manifest: gamePackManifestV1Schema,
  sha256: gamePackSha256Schema,
  relation: gamePackVersionRelationSchema,
  existingVersion: gamePackVersionSchema.optional(),
  compressedBytes: z.number().int().nonnegative().max(GAME_PACK_LIMITS.archiveBytes),
  extractedBytes: z.number().int().nonnegative().max(GAME_PACK_LIMITS.extractedBytes),
  entryCount: z.number().int().min(1).max(GAME_PACK_LIMITS.entries),
  unsigned: z.literal(true),
  expiresAt: z.string().datetime()
}).strict().superRefine((value, context) => {
  if (value.relation === 'new' && value.existingVersion) context.addIssue({ code: 'custom', path: ['existingVersion'], message: 'new packages cannot have an existing version' })
  if (value.relation !== 'new' && !value.existingVersion) context.addIssue({ code: 'custom', path: ['existingVersion'], message: 'replacement previews require an existing version' })
})

export const gamePackChoiceSchema = z.discriminatedUnion('canceled', [
  z.object({ canceled: z.literal(true) }).strict(),
  z.object({ canceled: z.literal(false), preview: gamePackImportPreviewSchema }).strict()
])

export const gamePackEventSchema = z.object({
  type: z.enum(['catalog-changed', 'window-crashed', 'window-unresponsive', 'launch-failed']),
  id: gamePackIdSchema.optional(),
  message: z.string().max(1_000).optional()
}).strict()

export type GamePackSource = z.infer<typeof gamePackSourceSchema>
export type GamePackStatus = z.infer<typeof gamePackStatusSchema>
export type GamePackVersionRelation = z.infer<typeof gamePackVersionRelationSchema>
export type GamePackItem = z.infer<typeof gamePackItemSchema>
export type GamePackSnapshot = z.infer<typeof gamePackSnapshotSchema>
export type GamePackImportPreview = z.infer<typeof gamePackImportPreviewSchema>
export type GamePackChoice = z.infer<typeof gamePackChoiceSchema>
export type GamePackEvent = z.infer<typeof gamePackEventSchema>

export const gamePackInstallInputSchema = z.object({ token: z.string().uuid(), baseRevision: gamePackSha256Schema }).strict()
export const gamePackSetEnabledInputSchema = z.object({ id: gamePackIdSchema, enabled: z.boolean(), baseRevision: gamePackSha256Schema }).strict()
export const gamePackLaunchInputSchema = z.object({ id: gamePackIdSchema }).strict()
export const gamePackClearDataInputSchema = z.object({ id: gamePackIdSchema }).strict()
export const gamePackUninstallInputSchema = z.object({ id: gamePackIdSchema, clearData: z.boolean(), baseRevision: gamePackSha256Schema }).strict()

export function compareGamePackVersions(left: string, right: string): number {
  const leftParts = gamePackVersionSchema.parse(left).split('.').map(Number)
  const rightParts = gamePackVersionSchema.parse(right).split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1
  }
  return 0
}
