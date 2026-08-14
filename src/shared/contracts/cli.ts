import { z } from 'zod'

export const PROTOCOL_VERSION = 1 as const
export const TEAM_WORKSPACE_CAPABILITY = 'team.workspace.v1'
export const TEAM_TASKS_CAPABILITY = 'team.tasks.v1'
export const TEAM_BLUEPRINT_V2_CAPABILITY = 'team.blueprint.v2'
export const TEAM_LOBBY_CAPABILITY = 'team.lobby.v1'
export const TEAM_PRESETS_CAPABILITY = 'team.presets.v1'
export const TEAM_MEMBER_PROFILE_CAPABILITY = 'team.member.profile.v1'
export const TEAM_AVATAR_READ_CAPABILITY = 'team.avatar.read.v1'
export const TEAM_V2_CAPABILITIES = [
  TEAM_WORKSPACE_CAPABILITY,
  TEAM_TASKS_CAPABILITY,
  TEAM_BLUEPRINT_V2_CAPABILITY,
  TEAM_LOBBY_CAPABILITY,
  TEAM_PRESETS_CAPABILITY,
  TEAM_MEMBER_PROFILE_CAPABILITY
] as const

export function supportsTeamV2(capabilities: readonly string[] | undefined): boolean {
  return TEAM_V2_CAPABILITIES.every((capability) => capabilities?.includes(capability))
}

const uuid = z.string().uuid()
export const promptIdSchema = z.string().min(1).max(255)
const commandBase = z.object({ protocolVersion: z.literal(1), commandId: uuid })
const eventBase = z.object({
  protocolVersion: z.literal(1),
  seq: z.number().int().positive(),
  sessionId: z.string().nullable()
})
const capabilitySchema = z.array(z.string()).default([])
export const sessionForkReasonSchema = z.enum(['edit-last-prompt', 'recover-interrupted'])

export const behaviorConstraintSchema = z.object({
  kind: z.enum(['noNetwork', 'noShell', 'readOnly', 'reviewOnly', 'custom']),
  instruction: z.string().trim().min(1), enforcement: z.literal('prompt').default('prompt')
})
export const memberProfileSchema = z.object({
  identity: z.object({ title: z.string().optional(), background: z.string().optional() }).optional(),
  personality: z.string().optional(),
  communication: z.object({
    language: z.string().optional(), tone: z.string().optional(),
    verbosity: z.enum(['concise', 'balanced', 'detailed']).optional(), instructions: z.string().optional()
  }).optional(),
  constraints: z.array(behaviorConstraintSchema).default([]), preferences: z.array(z.string()).default([])
}).default({ constraints: [], preferences: [] })
export const teamMemberDefinitionSchema = z.object({
  memberId: z.string().min(1), name: z.string().min(1), agent: z.string().min(1), avatar: z.string().optional(),
  model: z.string().optional(), provider: z.string().optional(), thinking: z.string().optional(), profile: memberProfileSchema
}).passthrough()
const legacyTeamMemberDefinitionSchema = teamMemberDefinitionSchema.omit({ memberId: true, profile: true }).passthrough()
export const teamChannelDefinitionSchema = z.object({
  name: z.string().min(1), mode: z.enum(['serial', 'free']).optional(), messageLimit: z.number().int().positive().optional(),
  members: z.array(z.string().min(1)).optional()
}).passthrough()
export const teamDefinitionSchema = z.object({
  schemaVersion: z.literal(2), teamId: z.string().min(1), name: z.string().min(1),
  leader: z.string().min(1).optional(),
  channel: z.object({ mode: z.enum(['serial', 'free']).optional(), messageLimit: z.number().int().positive().optional() }).optional(),
  channels: z.array(teamChannelDefinitionSchema).optional(),
  members: z.array(teamMemberDefinitionSchema).min(1),
  teams: z.array(z.object({ name: z.string().min(1).optional(), path: z.string().min(1) }).passthrough()).optional()
}).passthrough()
const legacyTeamDefinitionSchema = z.object({
  schemaVersion: z.literal(1), name: z.string().min(1), leader: z.string().min(1).optional(),
  channel: z.object({ mode: z.enum(['serial', 'free']).optional(), messageLimit: z.number().int().positive().optional() }).optional(),
  channels: z.array(teamChannelDefinitionSchema).optional(), members: z.array(legacyTeamMemberDefinitionSchema).min(1),
  teams: z.array(z.object({ name: z.string().min(1).optional(), path: z.string().min(1) }).passthrough()).optional()
}).passthrough()
const futureTeamDefinitionSchema = z.object({ schemaVersion: z.number().int().min(3) }).passthrough()
const teamMessageSchema = z.object({ seq: z.number().int().nonnegative(), from: z.string(), text: z.string(), at: z.number().int().nonnegative() })
export const teamSnapshotSchema = z.object({
  available: z.boolean(), path: z.string(), revision: z.string(), branch: z.string(), validation: z.string().nullable(),
  definition: z.union([legacyTeamDefinitionSchema, teamDefinitionSchema, futureTeamDefinitionSchema]).nullable(),
  agentDefinitions: z.array(z.object({ name: z.string(), description: z.string(), source: z.enum(['user', 'project']), model: z.string().optional(), provider: z.string().optional(), thinking: z.string().optional(), profile: memberProfileSchema.optional() })),
  avatars: z.array(z.string()),
  members: z.array(z.object({
    name: z.string(), agent: z.string(), avatar: z.string().optional(), avatarDataUrl: z.string().optional(), status: z.enum(['standby', 'busy', 'failed', 'offline']),
    memberId: z.string().optional(), pending: z.number().int().nonnegative(), unacked: z.number().int().nonnegative(), model: z.string(), provider: z.string(), thinking: z.string().optional(), profile: memberProfileSchema.optional(), kind: z.enum(['crew', 'hire']).optional(), recommended: z.boolean().optional(), taskId: z.string().optional(), restartRequired: z.boolean().optional()
  })),
  channels: z.array(z.object({
    name: z.string(), mode: z.enum(['serial', 'free']), seq: z.number().int().nonnegative(), frozen: z.boolean(),
    members: z.array(z.string()), messages: z.array(teamMessageSchema)
  }))
})

export const teamTaskStatusSchema = z.enum(['running', 'pausing', 'paused', 'awaiting_review', 'completed', 'cancelled'])
export const teamLobbyMessageSchema = z.object({
  seq: z.number().int().positive(), kind: z.enum(['user', 'member', 'system']), from: z.string().optional(),
  targets: z.array(z.string()).default([]), text: z.string(), at: z.number().int().nonnegative()
})
export const teamTaskMemberSchema = z.object({
  memberId: z.string().optional(), name: z.string(), agent: z.string(), description: z.string(), system: z.string(), inheritSystem: z.boolean(),
  avatar: z.string().optional(), model: z.string().optional(), provider: z.string().optional(), thinking: z.string().optional(),
  profile: memberProfileSchema.optional(), team: z.string(), directory: z.string()
})
export const teamTaskMessageSchema = z.object({
  seq: z.number().int().positive(), kind: z.enum(['user', 'member', 'system']), from: z.string().optional(), text: z.string(), at: z.number().int().nonnegative()
})
export const teamTaskSummarySchema = z.object({
  id: z.string(), title: z.string(), status: teamTaskStatusSchema, participants: z.array(teamTaskMemberSchema), leader: z.string(),
  projectPath: z.string(), branch: z.string(), createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(), reviewSummary: z.string().nullable()
})
export const teamTaskSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]), id: z.string(), projectKey: z.string(), projectPath: z.string(), branch: z.string(), team: z.string(),
  title: z.string(), description: z.string(), status: teamTaskStatusSchema, participants: z.array(teamTaskMemberSchema), leader: z.string(),
  channel: z.string(), createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
  pauseReason: z.string().optional(), pauseTarget: teamTaskStatusSchema.optional(), reviewSummary: z.string().optional(),
  contextMessageSeqs: z.array(z.number().int().positive()).optional(), contextMessages: z.array(teamLobbyMessageSchema).optional(),
  additionalConstraints: z.array(behaviorConstraintSchema).optional(),
  messages: z.array(teamTaskMessageSchema)
})

export const teamLobbySchema = z.object({
  schemaVersion: z.literal(1), id: z.string(), projectKey: z.string(), projectPath: z.string(), branch: z.string(),
  messages: z.array(teamLobbyMessageSchema)
})
export const teamPresetModelMappingSchema = z.object({
  provider: z.string().trim().min(1), model: z.string().trim().min(1), thinking: z.string().trim().min(1).optional()
})
export const teamPresetPreviewSchema = z.object({
  schemaVersion: z.literal(1), teamId: z.string(), teamName: z.string(), memberCount: z.number().int().nonnegative(),
  roleCount: z.number().int().nonnegative(), avatarCount: z.number().int().nonnegative(),
  items: z.array(z.object({ key: z.string(), kind: z.enum(['team', 'role', 'avatar']), name: z.string(), action: z.enum(['add', 'update', 'keep']) })),
  members: z.array(z.object({
    memberId: z.string().min(1), name: z.string().min(1), provider: z.string().optional(), model: z.string().optional(),
    thinking: z.string().optional(), needsMapping: z.boolean()
  }))
})

export const agentDefinitionInputSchema = z.object({
  name: z.string().trim().min(1), description: z.string(), model: z.string().optional(), provider: z.string().optional(),
  thinking: z.string().optional(), inheritSystem: z.boolean(), system: z.string(), profile: memberProfileSchema
})
export const agentDefinitionDocumentSchema = agentDefinitionInputSchema.extend({
  id: z.string(), source: z.enum(['user', 'project']), revision: z.string().length(64), path: z.string(), overridden: z.boolean()
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
  commandBase.extend({ type: z.literal('prompt.respond'), turnId: uuid, promptId: promptIdSchema, response: promptResponseSchema }),
  commandBase.extend({ type: z.literal('providers.list') }),
  commandBase.extend({ type: z.literal('models.list'), provider: z.string().min(1) }),
  commandBase.extend({ type: z.literal('settings.get') }),
  commandBase.extend({ type: z.literal('context.subscribe') }),
  commandBase.extend({ type: z.literal('team.subscribe') }),
  commandBase.extend({ type: z.literal('team.refresh') }),
  commandBase.extend({ type: z.literal('team.validate') }),
  commandBase.extend({ type: z.literal('team.save'), baseRevision: z.string().length(64), definition: teamDefinitionSchema }),
  commandBase.extend({ type: z.literal('team.start') }),
  commandBase.extend({ type: z.literal('team.stop') }),
  commandBase.extend({ type: z.literal('team.lobby.get'), beforeSeq: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).optional() }),
  commandBase.extend({ type: z.literal('team.lobby.post'), text: z.string().trim().min(1).max(1_000_000), targets: z.array(z.string().min(1)).default([]) }),
  commandBase.extend({ type: z.literal('team.avatar.import'), fileName: z.string().min(1).max(255), data: z.string().min(1).max(28_000_000) }),
  commandBase.extend({ type: z.literal('team.avatar.get'), avatar: z.string().regex(/^project:[0-9a-fA-F]{24}$/) }),
  commandBase.extend({ type: z.literal('team.preset.inspect'), data: z.string().min(1).max(44_739_244) }),
  commandBase.extend({
    type: z.literal('team.preset.import'), data: z.string().min(1).max(44_739_244), baseRevision: z.string().length(64),
    resolutions: z.record(z.string(), z.enum(['update', 'keep'])).default({}),
    modelMappings: z.record(z.string(), teamPresetModelMappingSchema).default({})
  }),
  commandBase.extend({ type: z.literal('team.preset.export') }),
  commandBase.extend({ type: z.literal('team.member.restart'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('team.member.useful'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('team.member.promote'), member: z.string().min(1), baseRevision: z.string().length(64) }),
  commandBase.extend({ type: z.literal('team.task.list') }),
  commandBase.extend({ type: z.literal('team.task.get'), taskId: z.string().min(1), beforeSeq: z.number().int().positive().optional(), limit: z.number().int().min(1).max(200).optional() }),
  commandBase.extend({
    type: z.literal('team.task.create'), title: z.string().trim().min(1).max(1_000_000), description: z.string().trim().min(1).max(1_000_000),
    participants: z.array(z.string().min(1)).min(1).optional(), leader: z.string().min(1).optional(),
    contextMessageSeqs: z.array(z.number().int().positive()).default([]), additionalConstraints: z.array(behaviorConstraintSchema).default([])
  }),
  commandBase.extend({ type: z.literal('team.task.post'), taskId: z.string().min(1), text: z.string().trim().min(1).max(1_000_000) }),
  commandBase.extend({ type: z.literal('team.task.pause'), taskId: z.string().min(1) }),
  commandBase.extend({ type: z.literal('team.task.resume'), taskId: z.string().min(1), message: z.string().max(1_000_000).optional() }),
  commandBase.extend({ type: z.literal('team.task.complete'), taskId: z.string().min(1) }),
  commandBase.extend({ type: z.literal('team.task.cancel'), taskId: z.string().min(1) }),
  commandBase.extend({ type: z.literal('agent.message'), member: z.string().min(1), message: z.string().trim().min(1).max(1_000_000) }),
  commandBase.extend({ type: z.literal('agent.stop'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('agent.remove'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('agent.activity.get'), member: z.string().min(1) }),
  commandBase.extend({ type: z.literal('agent.definition.list') }),
  commandBase.extend({ type: z.literal('agent.definition.get'), scope: z.enum(['user', 'project']), id: z.string().min(1) }),
  commandBase.extend({ type: z.literal('agent.definition.save'), scope: z.enum(['user', 'project']), id: z.string().min(1), baseRevision: z.string().length(64).optional(), definition: agentDefinitionInputSchema }),
  commandBase.extend({ type: z.literal('agent.definition.archive'), scope: z.enum(['user', 'project']), id: z.string().min(1), baseRevision: z.string().length(64) }),
  commandBase.extend({ type: z.literal('channel.post'), channel: z.string().min(1), text: z.string().trim().min(1).max(1_000_000) }),
  commandBase.extend({ type: z.literal('channel.history.get'), channel: z.string().min(1) }),
  commandBase.extend({ type: z.literal('session.rename'), name: z.string().trim().min(1).max(80) }),
  commandBase.extend({ type: z.literal('session.delete') }),
  commandBase.extend({
    type: z.literal('session.fork'),
    reason: sessionForkReasonSchema,
    sourceTurnId: uuid.optional(),
    sourceRevision: z.string().length(64).regex(/^[0-9a-fA-F]+$/).optional()
  }).superRefine((command, context) => {
    if (command.reason === 'edit-last-prompt' && Boolean(command.sourceTurnId) !== Boolean(command.sourceRevision)) {
      context.addIssue({ code: 'custom', message: 'sourceTurnId and sourceRevision must be provided together' })
    }
    if (command.reason === 'recover-interrupted' && (command.sourceTurnId || command.sourceRevision)) {
      context.addIssue({ code: 'custom', message: 'recover-interrupted does not accept a source turn' })
    }
  }),
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
  capabilities: capabilitySchema.optional(),
  transcriptRevision: z.string().length(64).optional(),
  parentSessionId: z.string().optional(),
  forkReason: sessionForkReasonSchema.optional()
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
    type: z.literal('context.usage'),
    commandId: uuid.optional(),
    turnId: uuid.optional(),
    usedTokens: z.number().int().nonnegative(),
    contextWindow: z.number().int().positive()
  }).refine((event) => Boolean(event.commandId || event.turnId), 'context.usage requires commandId or turnId'),
  eventBase.extend({
    type: z.literal('attachment.ready'),
    commandId: uuid,
    attachmentId: z.string().min(1).max(128),
    marker: z.string().regex(/^#\[image \d+\]$/),
    mediaType: z.enum(['image/png', 'image/jpeg'])
  }),
  eventBase.extend({ type: z.literal('turn.started'), commandId: uuid, turnId: uuid, promptRevision: z.string().length(64).optional() }),
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
    promptId: promptIdSchema,
    kind: z.enum(['permission', 'question']),
    title: z.string(),
    question: z.string(),
    options: z.array(optionSchema),
    allowFreeText: z.boolean()
  }),
  eventBase.extend({
    type: z.literal('prompt.resolved'),
    turnId: uuid,
    promptId: promptIdSchema,
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
  eventBase.extend({ type: z.literal('team.tasks.snapshot'), commandId: uuid.optional(), branch: z.string(), tasks: z.array(teamTaskSummarySchema) }),
  eventBase.extend({ type: z.literal('team.lobby.snapshot'), commandId: uuid.optional(), lobby: teamLobbySchema }),
  eventBase.extend({ type: z.literal('team.lobby.message'), message: teamLobbyMessageSchema }),
  eventBase.extend({ type: z.literal('team.avatar.imported'), commandId: uuid, avatar: z.string(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('team.avatar.loaded'), commandId: uuid, avatar: z.string(), dataUrl: z.string().startsWith('data:image/png;base64,') }),
  eventBase.extend({ type: z.literal('team.preset.preview'), commandId: uuid, preview: teamPresetPreviewSchema }),
  eventBase.extend({ type: z.literal('team.preset.imported'), commandId: uuid, preview: teamPresetPreviewSchema, snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('team.preset.exported'), commandId: uuid, fileName: z.string(), data: z.string() }),
  eventBase.extend({ type: z.literal('team.member.configured'), commandId: uuid, action: z.enum(['restarted', 'useful', 'promoted']), member: z.string(), memberId: z.string().optional(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('team.task.updated'), commandId: uuid.optional(), action: z.string(), task: teamTaskSummarySchema, detail: teamTaskSchema.optional() }),
  eventBase.extend({ type: z.literal('team.task.message'), taskId: z.string(), message: teamTaskMessageSchema }),
  eventBase.extend({ type: z.literal('team.member.updated'), member: z.string(), status: z.enum(['running', 'idle', 'stopped', 'offline']), taskId: z.string().optional() }),
  eventBase.extend({ type: z.literal('team.validation'), commandId: uuid, valid: z.boolean(), msg: z.string() }),
  eventBase.extend({ type: z.literal('team.updated'), commandId: uuid, action: z.enum(['saved', 'started', 'stopped']), msg: z.string(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('agent.updated'), commandId: uuid, action: z.enum(['messaged', 'stopped', 'removed']), member: z.string(), msg: z.string(), snapshot: teamSnapshotSchema }),
  eventBase.extend({ type: z.literal('agent.activity'), commandId: uuid, member: z.string(), activity: z.array(z.object({ id: z.string(), kind: z.string(), summary: z.string(), status: z.string() })) }),
  eventBase.extend({ type: z.literal('agent.definitions.snapshot'), commandId: uuid, definitions: z.array(agentDefinitionDocumentSchema) }),
  eventBase.extend({ type: z.literal('agent.definition.updated'), commandId: uuid, action: z.enum(['loaded', 'saved', 'archived']), definition: agentDefinitionDocumentSchema, archivePath: z.string().optional() }),
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
  eventBase.extend({
    type: z.literal('session.forked'), commandId: uuid, sourceSessionId: z.string(),
    reason: sessionForkReasonSchema, metadata: cliSessionMetadataSchema, warnings: z.array(z.string())
  }),
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
export type TeamTaskStatus = z.infer<typeof teamTaskStatusSchema>
export type TeamTaskMember = z.infer<typeof teamTaskMemberSchema>
export type TeamTaskMessage = z.infer<typeof teamTaskMessageSchema>
export type TeamTaskSummary = z.infer<typeof teamTaskSummarySchema>
export type TeamTask = z.infer<typeof teamTaskSchema>
export type TeamLobby = z.infer<typeof teamLobbySchema>
export type TeamLobbyMessage = z.infer<typeof teamLobbyMessageSchema>
export type MemberProfile = z.infer<typeof memberProfileSchema>
export type BehaviorConstraint = z.infer<typeof behaviorConstraintSchema>
export type TeamPresetPreview = z.infer<typeof teamPresetPreviewSchema>
export type TeamPresetModelMapping = z.infer<typeof teamPresetModelMappingSchema>
export type AgentDefinitionInput = z.infer<typeof agentDefinitionInputSchema>
export type AgentDefinitionDocument = z.infer<typeof agentDefinitionDocumentSchema>
export type SessionForkReason = z.infer<typeof sessionForkReasonSchema>
export type ContextUsage = Pick<Extract<CliEvent, { type: 'context.usage' }>, 'usedTokens' | 'contextWindow'>
