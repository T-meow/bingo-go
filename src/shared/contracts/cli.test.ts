import { describe, expect, it } from 'vitest'
import { TEAM_V2_CAPABILITIES, cliEventSchema, clientCommandSchema, supportsTeamV2 } from './cli'

const id = '123e4567-e89b-42d3-a456-426614174000'

describe('protocol v1 contracts', () => {
  it('requires the complete capability bundle for Team v2 UI', () => {
    expect(supportsTeamV2([...TEAM_V2_CAPABILITIES])).toBe(true)
    expect(supportsTeamV2(TEAM_V2_CAPABILITIES.filter((capability) => capability !== 'team.blueprint.v2'))).toBe(false)
  })

  it('validates context subscription and both usage event shapes', () => {
    expect(clientCommandSchema.parse({ protocolVersion: 1, commandId: id, type: 'context.subscribe' }).type).toBe('context.subscribe')
    expect(cliEventSchema.parse({ protocolVersion: 1, seq: 2, sessionId: 'session-1', type: 'context.usage', commandId: id, usedTokens: 12, contextWindow: 128_000 })).toMatchObject({ usedTokens: 12 })
    expect(cliEventSchema.parse({ protocolVersion: 1, seq: 3, sessionId: 'session-1', type: 'context.usage', turnId: id, usedTokens: 24, contextWindow: 128_000 })).toMatchObject({ turnId: id })
    expect(() => cliEventSchema.parse({ protocolVersion: 1, seq: 4, sessionId: 'session-1', type: 'context.usage', usedTokens: 24, contextWindow: 128_000 })).toThrow()
  })

  it('accepts cancellation reasons and additive fields', () => {
    const event = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 4,
      sessionId: 'session',
      type: 'turn.cancelled',
      turnId: id,
      reason: 'requested',
      futureField: true
    })
    expect(event.type).toBe('turn.cancelled')
  })

  it('requires turnId for prompt responses', () => {
    expect(() => clientCommandSchema.parse({
      protocolVersion: 1,
      type: 'prompt.respond',
      commandId: id,
      promptId: id,
      response: { kind: 'cancel' }
    })).toThrow()
  })

  it('accepts side-effect-free inspection metadata', () => {
    const event = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 1,
      sessionId: null,
      type: 'inspection.ready',
      metadata: {
        bingoVersion: '0.4.0',
        protocolVersion: 1,
        cwd: '/tmp',
        provider: 'default',
        model: 'model',
        thinkingLevel: 'off',
        permissionMode: 'default',
        theme: 'auto',
        supportsImages: false
      }
    })
    expect(event.type).toBe('inspection.ready')
  })

  it('rejects unknown event types', () => {
    expect(() => cliEventSchema.parse({ protocolVersion: 1, seq: 2, sessionId: null, type: 'future.event' })).toThrow()
  })

  it('validates attachment registration commands and ready events', () => {
    expect(clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'attachment.add',
      attachmentId: 'image-1',
      data: 'aA=='
    }).type).toBe('attachment.add')
    const event = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 2,
      sessionId: 'session',
      type: 'attachment.ready',
      commandId: id,
      attachmentId: 'image-1',
      marker: '#[image 1]',
      mediaType: 'image/png'
    })
    expect(event.type).toBe('attachment.ready')
  })

  it('validates session fork commands, metadata, and revision-aware turn starts', () => {
    const command = clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'session.fork',
      reason: 'edit-last-prompt',
      sourceTurnId: id,
      sourceRevision: 'a'.repeat(64)
    })
    expect(command.type).toBe('session.fork')
    expect(() => clientCommandSchema.parse({ ...command, sourceRevision: undefined })).toThrow()

    const event = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 2,
      sessionId: 'source-session',
      type: 'session.forked',
      commandId: id,
      sourceSessionId: 'source-session',
      reason: 'edit-last-prompt',
      warnings: [],
      metadata: {
        bingoVersion: '0.4.0', protocolVersion: 1, sessionId: 'child-session', displayName: 'Branch', transcriptPath: '/tmp/child.jsonl',
        resumed: true, cwd: '/tmp', provider: 'default', model: 'model', thinkingLevel: 'off', permissionMode: 'default', theme: 'auto',
        supportsImages: false, capabilities: ['session.fork.v1'], transcriptRevision: 'b'.repeat(64), parentSessionId: 'source-session', forkReason: 'edit-last-prompt'
      }
    })
    expect(event).toMatchObject({ type: 'session.forked', metadata: { parentSessionId: 'source-session', forkReason: 'edit-last-prompt' } })

    expect(cliEventSchema.parse({
      protocolVersion: 1, seq: 3, sessionId: 'child-session', type: 'turn.started', commandId: id, turnId: id, promptRevision: 'c'.repeat(64)
    })).toMatchObject({ promptRevision: 'c'.repeat(64) })
  })

  it('accepts a future Team schema as a read-only snapshot', () => {
    const event = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 2,
      sessionId: 'session',
      type: 'team.snapshot',
      snapshot: {
        available: true,
        path: '/tmp/team.json',
        revision: 'a'.repeat(64),
        branch: 'main',
        validation: null,
        definition: { schemaVersion: 3, futureField: { keep: true } },
        agentDefinitions: [],
        avatars: [],
        members: [],
        channels: []
      }
    })
    expect(event.type).toBe('team.snapshot')
    if (event.type === 'team.snapshot') expect(event.snapshot.definition).toMatchObject({ schemaVersion: 3, futureField: { keep: true } })
  })

  it('preserves unknown v2 Team fields but rejects saving a future schema', () => {
    const command = clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'team.save',
      baseRevision: 'a'.repeat(64),
      definition: {
        schemaVersion: 2,
        teamId: 'team-reviewers',
        name: 'reviewers',
        futureField: { keep: true },
        members: [{ memberId: 'member-reviewer', name: 'reviewer', agent: 'reviewer', profile: { constraints: [], preferences: [] }, futureMemberField: 1 }]
      }
    })
    expect(command.type).toBe('team.save')
    if (command.type === 'team.save') expect(command.definition).toMatchObject({ futureField: { keep: true } })

    expect(() => clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'team.save',
      baseRevision: 'a'.repeat(64),
      definition: { schemaVersion: 3 }
    })).toThrow()
  })

  it('validates Team v2 profiles, immutable task context inputs, and preset mappings', () => {
    const task = clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'team.task.create',
      title: 'Review release',
      description: 'Check compatibility',
      participants: ['reviewer'],
      leader: 'reviewer',
      contextMessageSeqs: [2, 4],
      additionalConstraints: [{ kind: 'noNetwork', instruction: 'Do not use network tools.' }]
    })
    expect(task.type).toBe('team.task.create')
    if (task.type === 'team.task.create') {
      expect(task.contextMessageSeqs).toEqual([2, 4])
      expect(task.additionalConstraints[0]).toMatchObject({ kind: 'noNetwork', enforcement: 'prompt' })
    }

    const preset = clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'team.preset.import',
      data: 'e30=',
      baseRevision: 'b'.repeat(64),
      resolutions: { 'team:team-dev': 'update' },
      modelMappings: { 'member-reviewer': { provider: 'deepseek', model: 'deepseek-chat', thinking: 'high' } }
    })
    expect(preset.type).toBe('team.preset.import')
    if (preset.type === 'team.preset.import') expect(preset.modelMappings['member-reviewer'].model).toBe('deepseek-chat')
  })

  it('accepts asynchronous lobby and temporary-member snapshot fields', () => {
    const lobbyEvent = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 8,
      sessionId: 'session',
      type: 'team.lobby.message',
      message: { seq: 4, kind: 'member', from: 'helper', targets: [], text: 'Report', at: 10 }
    })
    expect(lobbyEvent.type).toBe('team.lobby.message')

    const preview = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 9,
      sessionId: 'session',
      commandId: id,
      type: 'team.preset.preview',
      preview: {
        schemaVersion: 1,
        teamId: 'team-dev',
        teamName: 'dev',
        memberCount: 1,
        roleCount: 1,
        avatarCount: 0,
        items: [{ key: 'team:team-dev', kind: 'team', name: 'dev', action: 'update' }],
        members: [{ memberId: 'member-reviewer', name: 'reviewer', needsMapping: true }]
      }
    })
    expect(preview.type).toBe('team.preset.preview')
  })

  it('treats prompt IDs as opaque protocol identifiers', () => {
    const event = cliEventSchema.parse({
      protocolVersion: 1,
      seq: 2,
      sessionId: 'session',
      type: 'prompt.request',
      turnId: id,
      promptId: 'prompt-1',
      kind: 'permission',
      title: 'Allow running Bash',
      question: 'Bash needs permission',
      options: [{ id: 'allow', label: 'Allow' }],
      allowFreeText: false
    })
    expect(event.type).toBe('prompt.request')
    expect(clientCommandSchema.parse({
      protocolVersion: 1,
      type: 'prompt.respond',
      commandId: id,
      turnId: id,
      promptId: 'prompt-1',
      response: { kind: 'option', optionId: 'allow' }
    }).type).toBe('prompt.respond')
  })
})
