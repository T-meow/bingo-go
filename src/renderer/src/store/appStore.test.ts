import { describe, expect, it } from 'vitest'
import type { AppServerNotification, ConversationSnapshot, Item, SessionSnapshot } from '../../../shared/contracts/appServer'
import {
  applyConversationSnapshot,
  applyNotification,
  applySessionSnapshot,
  initialAppStore,
  selectConversationItems,
  selectInteractionFor,
  selectMainConversation,
  type AppStore
} from './appStore'

const event = (seq: number) => ({ seq, sessionId: 'sess_1', ts: seq, causedBy: null, coalescedFrom: null })
const notification = (method: AppServerNotification['method'], params: Record<string, unknown>): AppServerNotification => ({ jsonrpc: '2.0', method, params }) as unknown as AppServerNotification

function conversation(snapshot: Partial<ConversationSnapshot>): ConversationSnapshot {
  return {
    activeTurn: null,
    contextUsage: { used: 10, window: 100, trigger: 90 },
    conversation: {
      id: 'conv_main', kind: { type: 'main' }, title: 'Main', runState: 'running',
      unread: 0, mentions: 0, obligations: [], pendingInteractions: 0, queueCount: 0,
      queueRevision: 1, revision: 1, historyGeneration: 1, isMember: true,
      lastActivityAt: 0, lastItemId: null, readCursor: null, activeTurnId: null
    },
    eventCursor: 9,
    historyGeneration: 1,
    interactions: [],
    items: { items: [], revision: 1, nextCursor: null },
    queue: { items: [], revision: 1, nextCursor: null },
    ...snapshot
  }
}

function item(id: string, type: Item['type'], text = ''): Item {
  return { id, status: 'streaming', type, text } as unknown as Item
}

function sessionSnapshot(): SessionSnapshot {
  return {
    session: {
      id: 'sess_1', epoch: 'epoch_1', locator: { type: 'stem', stem: 'bingo-1' },
      cwd: '/tmp', provider: 'default', model: 'model', thinking: 'off',
      permissionMode: 'default', title: 'Session', state: 'active',
      resumed: false, createdAt: 0, updatedAt: 0
    },
    capabilities: { images: true, multiConversation: true, reasoning: true, rooms: true, shell: true, teams: true },
    config: {
      cwd: '/tmp', provider: 'default', model: 'model', thinking: 'off',
      permissionMode: 'default', theme: 'dark', shell: 'zsh', shellDialect: 'posix',
      permissions: [], mcpServers: [], layers: [], revision: 1
    },
    conversations: { active: [conversation({}).conversation], count: 1, revision: 1 },
    collections: {
      agents: { active: [], count: 0, revision: 1 },
      rooms: { active: [], count: 0, revision: 1 },
      tasks: { active: [], count: 0, revision: 1 },
      deliveries: { active: [], count: 0, revision: 1 },
      backgroundCommands: { active: [], count: 0, revision: 1 },
      mcpServers: []
    },
    activeTurns: [],
    interactions: [],
    operations: [],
    feedback: [],
    eventCursor: 9
  }
}

describe('appStore', () => {
  it('materializes a session snapshot and conversation snapshots', () => {
    const state = applySessionSnapshot(initialAppStore, sessionSnapshot())
    expect(state.session?.epoch).toBe('epoch_1')
    expect(selectMainConversation(state)?.id).toBe('conv_main')
    const withItems = applyConversationSnapshot(state, 'conv_main', conversation({
      items: { items: [item('item_1', 'userMessage', 'hello')], revision: 1, nextCursor: null }
    }))
    expect(selectConversationItems(withItems, 'conv_main')).toHaveLength(1)
    expect(withItems.lastEventCursor).toBe(9)
  })

  it('appends text deltas to the live item and commits the authoritative item', () => {
    let state = applySessionSnapshot(initialAppStore, sessionSnapshot())
    state = applyNotification(state, notification('item/started', {
      conversationId: 'conv_main', event: event(10), item: item('item_1', 'assistantMessage', 'Hel')
    }))
    state = applyNotification(state, notification('item/textDelta', {
      conversationId: 'conv_main', event: event(11), itemId: 'item_1', delta: 'lo', deltaSeq: 2, turnId: 'turn_1'
    }))
    expect(selectConversationItems(state, 'conv_main')[0]).toMatchObject({ type: 'assistantMessage', text: 'Hello', status: 'streaming' })
    const completed = { ...item('item_1', 'assistantMessage', 'Hello'), status: 'completed' as const }
    state = applyNotification(state, notification('item/completed', { conversationId: 'conv_main', event: event(12), item: completed }))
    expect(selectConversationItems(state, 'conv_main')[0]).toMatchObject({ status: 'completed', text: 'Hello' })
    expect(state.transcripts.get('conv_main')?.live).toHaveLength(0)
  })

  it('withdraws a failed retry attempt exactly', () => {
    let state = applySessionSnapshot(initialAppStore, sessionSnapshot())
    state = applyNotification(state, notification('item/started', {
      conversationId: 'conv_main', event: event(10), item: item('item_bad', 'assistantMessage', 'bad')
    }))
    state = applyNotification(state, notification('item/started', {
      conversationId: 'conv_main', event: event(11), item: item('item_good', 'toolCall')
    }))
    state = applyNotification(state, notification('turn/retrying', {
      conversationId: 'conv_main', turnId: 'turn_1', round: 1, attempt: 2, maxAttempts: 3, delayMs: 100,
      removedItemIds: ['item_bad'], reason: null, code: null, event: event(12)
    }))
    const ids = selectConversationItems(state, 'conv_main').map((entry) => entry.id)
    expect(ids).toEqual(['item_good'])
  })

  it('keeps queue entries ordered and absorbs the eligible prefix', () => {
    let state = applySessionSnapshot(initialAppStore, sessionSnapshot())
    const entry = (id: string) => ({ id, text: id, queuedAt: 0, attachments: [], originConversationId: 'conv_main', steerEligible: true })
    state = applyNotification(state, notification('queue/itemAdded', {
      conversationId: 'conv_main', event: event(10), entry: entry('queue_1'), position: 0, revision: 2
    }))
    state = applyNotification(state, notification('queue/itemAdded', {
      conversationId: 'conv_main', event: event(11), entry: entry('queue_2'), position: 1, revision: 3
    }))
    expect(state.transcripts.get('conv_main')?.queue.map((queued) => queued.id)).toEqual(['queue_1', 'queue_2'])
    state = applyNotification(state, notification('queue/itemAbsorbed', {
      conversationId: 'conv_main', event: event(12), queueId: 'queue_1', itemId: 'item_1', turnId: 'turn_1', revision: 4
    }))
    expect(state.transcripts.get('conv_main')?.queue.map((queued) => queued.id)).toEqual(['queue_2'])
  })

  it('opens and resolves interactions without transport correlation', () => {
    let state = applySessionSnapshot(initialAppStore, sessionSnapshot())
    state = applyNotification(state, notification('interaction/opened', {
      event: event(10), interaction: { id: 'int_1', conversationId: 'conv_main', openedAt: 1, remainingGuardMs: 0, prompt: { type: 'question', title: 'T', question: 'Q', options: [], allowsFreeText: false }, turnId: null, itemId: null }
    }))
    expect(selectInteractionFor(state, 'conv_main')).toHaveLength(1)
    state = applyNotification(state, notification('interaction/resolved', {
      conversationId: 'conv_main', event: event(11), interactionId: 'int_1', decision: { type: 'answer', optionId: null, text: 'x' }, itemId: null
    }))
    expect(selectInteractionFor(state, 'conv_main')).toHaveLength(0)
  })

  it('replaces collections by keyed upsert and removal', () => {
    let state = applySessionSnapshot(initialAppStore, sessionSnapshot())
    state = applyNotification(state, notification('room/changed', {
      event: event(10), room: { id: 'room_1', name: 'build', mode: 'broadcast', members: ['main'], userIsMember: true, conversationId: 'conv_room', messageCount: 0, lastSeq: 0, unread: 0, mentions: 0, topic: null }
    }))
    expect(state.rooms.byId.get('room_1')?.name).toBe('build')
    state = applyNotification(state, notification('room/changed', {
      event: event(11), room: { id: 'room_1', name: 'build', mode: 'broadcast', members: ['main'], userIsMember: true, conversationId: 'conv_room', messageCount: 1, lastSeq: 1, unread: 1, mentions: 0, topic: null }
    }))
    expect(state.rooms.active[0]?.unread).toBe(1)
  })
})
