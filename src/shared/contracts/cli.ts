import { z } from 'zod'

export const PROTOCOL_VERSION = 1 as const

const uuid = z.string().uuid()
const commandBase = z.object({ protocolVersion: z.literal(1), commandId: uuid })
const eventBase = z.object({
  protocolVersion: z.literal(1),
  seq: z.number().int().positive(),
  sessionId: z.string().nullable()
})
const capabilitySchema = z.array(z.string()).default([])

export const teamMemberDefinitionSchema = z.object({
  name: z.string().min(1), agent: z.string().min(1), avatar: z.string().optional(), model: z.string().optional(),
  provider: z.string().optional(), thinking: z.string().optional()
}).passthrough()
export const teamDefinitionSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().min(1),
  channel: z.object({ mode: z.enum(['serial', 'free']).optional(), messageLimit: z.number().int().positive().optional() }).optional(),
  members: z.array(teamMemberDefinitionSchema).min(1)
}).passthrough()
const futureTeamDefinitionSchema = z.object({ schemaVersion: z.number().int().min(2) }).passthrough()
const teamMessageSchema = z.object({ seq: z.number().int().nonnegative(), from: z.string(), text: z.string(), at: z.number().int().nonnegative() })
export const teamSnapshotSchema = z.object({
  available: z.boolean(), path: z.string(), revision: z.string(), branch: z.string(), validation: z.string().nullable(),
  definition: z.union([teamDefinitionSchema, futureTeamDefinitionSchema]).nullable(),
  agentDefinitions: z.array(z.object({ name: z.string(), description: z.string(), source: z.enum(['user', 'project']), model: z.string().optional(), provider: z.string().optional(), thinking: z.string().optional() })),
  avatars: z.array(z.string()),
  members: z.array(z.object({
    name: z.string(), agent: z.string(), avatar: z.string().optional(), status: z.enum(['standby', 'busy', 'failed', 'offline']),
    pending: z.number().int().nonnegative(), unacked: z.number().int().nonnegative(), model: z.string(), provider: z.string()
  })),
  channels: z.array(z.object({
    name: z.string(), mode: z.enum(['serial', 'free']), seq: z.number().int().nonnegative(), frozen: z.boolean(),
    members: z.array(z.string()), messages: z.array(teamMessageSchema)
  }))
})

const promptResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), optionId: z.string() }),
  z.object({ kind: z.literal('text'), text: z.string().max(100_000) }),
  z.object({ kind: z.literal('cancel') })
])

export const clientCommandSchema = z.discriminatedUnion('type', [
  commandBase.extend({
    type: z.literal('attachment.add'),
    attachmentId: z.string().min(1).max(128),
    data: z.string().min(1).max(44_739_244)
  }),
  commandBase.extend({ type: z.literal('turn.start'), turnId: uuid, prompt: z.string().min(1).max(1_000_000) }),
  commandBase.extend({ type: z.literal('turn.cancel'), turnId: uuid }),
  commandBase.extend({ type: z.literal('prompt.respond'), turnId: uuid, promptId: uuid, response: promptResponseSchema }),
  commandBase.extend({ type: z.literal('providers.list') }),
  commandBase.extend({ type: z.literal('models.list'), provider: z.string().min(1) }),
  commandBase.extend({ type: z.literal('settings.get') }),
  commandBase.extend({ type: z.literal('team.subscribe') }),
  commandBase.extend({ type: z.literal('team.refresh') }),
  commandBase.extend({ type: z.literal('team.validate') }),
  commandBase.extend({ type: z.literal('team.save'), baseRevision: z.string().length(64), definition: teamDefinitionSchema }),
  commandBase.extend({ type: z.literal('team.start') }),
  commandBase.extend({ type: z.literal('team.stop') }),
  commandBase.extend({ type: z.literal('agent.message'), member: z.string().min(1), message: z.string().trim().min(1).max(1_000_000) }),
  commandBase.extend({ type: z.literal('agent.stop'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('agent.remove'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('agent.activity.get'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('channel.post'), channel: z.string().min(1), text: z.string().trim().min(1).max(1_000_000) }),
  commandBase.extend({ type: z.literal('channel.history.get'), channel: z.string().min(1) }),
  commandBase.extend({ type: z.literal('session.rename'), name: z.string().trim().min(1).max(80) }),
  commandBase.extend({ type: z.literal('session.delete') }),
  commandBase.extend({ type: z.literal('session.close') })
])

export const cliSessionMetadataSchema = z.object({
  bingoVersion: z.string(),
  protocolVersion: z.literal(1),
  sessionId: z.string(),
  displayName: z.string().default('New conversation'),
  transcriptPath: z.string(),
  resumed: z.boolean(),
  cwd: z.string(),
  provider: z.string(),
  model: z.string(),
  thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh', 'max']),
  permissionMode: z.string(),
  theme: z.enum(['auto', 'dark', 'light']),
  supportsImages: z.boolean(),
  capabilities: capabilitySchema.optional()
})

export const cliInspectionMetadataSchema = z.object({
  bingoVersion: z.string(),
  protocolVersion: z.literal(1),
  cwd: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  permissionMode: z.string().optional(),
  theme: z.enum(['auto', 'dark', 'light']).optional(),
  supportsImages: z.boolean().optional(),
  capabilities: capabilitySchema.optional()
})

const optionSchema = z.object({ id: z.string(), label: z.string(), description: z.string().optional() })

export const cliEventSchema = z.union([
  z.object({
    protocolVersion: z.literal(1),
    seq: z.literal(1),
    sessionId: z.null(),
    type: z.literal('protocol.ready'),
    bingoVersion: z.string().optional(),
    metadata: z.object({ bingoVersion: z.string(), protocolVersion: z.literal(1), capabilities: capabilitySchema.optional() }).optional(),
    capabilities: capabilitySchema.optional()
  }).refine((event) => Boolean(event.bingoVersion || event.metadata), 'protocol.ready requires bingoVersion metadata'),
  z.object({ protocolVersion: z.literal(1), seq: z.literal(1), sessionId: z.null(), type: z.literal('inspection.ready'), metadata: cliInspectionMetadataSchema }),
  eventBase.extend({ type: z.literal('session.ready'), metadata: cliSessionMetadataSchema }),
  eventBase.extend({
    type: z.literal('attachment.ready'),
    commandId: uuid,
    attachmentId: z.string().min(1).max(128),
    marker: z.string().regex(/^#\[image \d+\]$/),
    mediaType: z.enum(['image/png', 'image/jpeg'])
  }),
  eventBase.extend({ type: z.literal('turn.started'), commandId: uuid, turnId: uuid }),
  eventBase.extend({ type: z.literal('text.delta'), turnId: uuid, delta: z.string() }),
  eventBase.extend({ type: z.literal('tool.ready'), turnId: uuid, toolCallId: z.string(), name: z.string(), summary: z.string() }),
  eventBase.extend({
    type: z.literal('tool.done'),
    turnId: uuid,
    toolCallId: z.string(),
    name: z.string(),
    summary: z.string(),
    status: z.enum(['done', 'error', 'interrupted']),
    output: z.string(),
    // TODO(upstream JSON-events issue): preserve image blocks via bounded references or chunks.
    durationMs: z.number().nonnegative()
  }),
  eventBase.extend({
    type: z.literal('prompt.request'),
    turnId: uuid,
    promptId: uuid,
    kind: z.enum(['permission', 'question']),
    title: z.string(),
    question: z.string(),
    options: z.array(optionSchema),
    allowFreeText: z.boolean()
  }),
  eventBase.extend({
    type: z.literal('prompt.resolved'),
    turnId: uuid,
    promptId: uuid,
    commandId: uuid.optional(),
    reason: z.enum(['responded', 'turn-cancelled', 'session-closing'])
  }),
  eventBase.extend({
    type: z.literal('providers.result'),
    commandId: uuid,
    providers: z.array(z.object({
      name: z.string(),
      protocol: z.enum(['anthropic', 'openai']),
      apiBaseUrl: z.string(),
      supportsImages: z.boolean(),
      credentialConfigured: z.boolean(),
      builtin: z.boolean()
    }))
  }),
  eventBase.extend({ type: z.literal('models.result'), commandId: uuid, provider: z.string(), models: z.array(z.string()) }),
  eventBase.extend({
    type: z.literal('settings.result'), commandId: uuid,
    settings: z.object({
      apiBaseUrl: z.string(), provider: z.string(), model: z.string(), thinkingLevel: z.string(), permissionMode: z.string(),
      theme: z.string(), motion: z.string(), sendImages: z.boolean(), cacheControl: z.boolean(), respondToBashCommands: z.boolean(),
      shell: z.string(), credentialConfigured: z.boolean(), providerCount: z.number().int().nonnegative(), mcpServerCount: z.number().int().nonnegative(),
      disabledMcpServers: z.array(z.string()), permissionAllow: z.array(z.string()), permissionAsk: z.array(z.string()), permissionDeny: z.array(z.string()),
      teamAutoStart: z.boolean(), agentChannels: z.boolean(), channelMessageLimit: z.number().int().nonnegative(), agentMessageLimit: z.number().int().nonnegative(), shareBaseUrl: z.string()
    }),
    layers: z.array(z.object({ name: z.enum(['user', 'project', 'local']), path: z.string(), exists: z.boolean(), keys: z.array(z.string()) }))
  }),
  eventBase.extend({ type: z.literal('team.snapshot'), commandId: uuid.optional(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('team.validation'), commandId: uuid, valid: z.boolean(), msg: z.string() }),
  eventBase.extend({ type: z.literal('team.updated'), commandId: uuid, action: z.enum(['saved', 'started', 'stopped']), msg: z.string(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('agent.updated'), commandId: uuid, action: z.enum(['messaged', 'stopped', 'removed']), member: z.string(), msg: z.string(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('agent.activity'), commandId: uuid, member: z.string(), activity: z.array(z.object({ id: z.string(), kind: z.string(), summary: z.string(), status: z.string() })) }),
  eventBase.extend({ type: z.literal('channel.updated'), commandId: uuid, channel: z.string(), msg: z.string(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('channel.message'), commandId: uuid.optional(), channel: z.string(), message: teamMessageSchema }),
  eventBase.extend({ type: z.literal('warning'), turnId: uuid.optional(), code: z.string().optional(), msg: z.string() }),
  eventBase.extend({ type: z.literal('turn.completed'), turnId: uuid, outputTokens: z.number().int().nonnegative().optional() }),
  eventBase.extend({
    type: z.literal('turn.cancelled'),
    turnId: uuid,
    commandId: uuid.optional(),
    reason: z.enum(['requested', 'stdin-eof', 'session-closing'])
  }),
  eventBase.extend({ type: z.literal('session.renamed'), commandId: uuid, previousSessionId: z.string(), metadata: cliSessionMetadataSchema }),
  eventBase.extend({ type: z.literal('session.deleted'), commandId: uuid, deletedSessionId: z.string() }),
  eventBase.extend({ type: z.literal('session.closed'), commandId: uuid }),
  eventBase.extend({
    type: z.literal('error'),
    scope: z.enum(['command', 'turn', 'session']),
    commandId: uuid.optional(),
    turnId: uuid.optional(),
    code: z.string(),
    msg: z.string(),
    level: z.enum(['field', 'page', 'flow']),
    recoverable: z.boolean()
  })
])

export type ClientCommand = z.infer<typeof clientCommandSchema>
export type CliEvent = z.infer<typeof cliEventSchema>
export type CliSessionMetadata = z.infer<typeof cliSessionMetadataSchema>
export type CliInspectionMetadata = z.infer<typeof cliInspectionMetadataSchema>
export type PromptResponse = z.infer<typeof promptResponseSchema>
export type TeamDefinition = z.infer<typeof teamDefinitionSchema>
export type TeamSnapshot = z.infer<typeof teamSnapshotSchema>
