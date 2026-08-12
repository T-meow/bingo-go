import { describe, expect, it } from 'vitest'
import { cliEventSchema, clientCommandSchema } from './cli'

const id = '123e4567-e89b-42d3-a456-426614174000'

describe('protocol v1 contracts', () => {
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
        definition: { schemaVersion: 2, futureField: { keep: true } },
        agentDefinitions: [],
        avatars: [],
        members: [],
        channels: []
      }
    })
    expect(event.type).toBe('team.snapshot')
    if (event.type === 'team.snapshot') expect(event.snapshot.definition).toMatchObject({ schemaVersion: 2, futureField: { keep: true } })
  })

  it('preserves unknown v1 Team fields but rejects saving a future schema', () => {
    const command = clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'team.save',
      baseRevision: 'a'.repeat(64),
      definition: {
        schemaVersion: 1,
        name: 'reviewers',
        futureField: { keep: true },
        members: [{ name: 'reviewer', agent: 'reviewer', futureMemberField: 1 }]
      }
    })
    expect(command.type).toBe('team.save')
    if (command.type === 'team.save') expect(command.definition).toMatchObject({ futureField: { keep: true } })

    expect(() => clientCommandSchema.parse({
      protocolVersion: 1,
      commandId: id,
      type: 'team.save',
      baseRevision: 'a'.repeat(64),
      definition: { schemaVersion: 2 }
    })).toThrow()
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
