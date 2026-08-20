import type {
  AgentId,
  ItemId,
  AgentResource,
  AppServerNotification,
  BackgroundCommandResource,
  CommandTail,
  ConfigSnapshot,
  ConversationId,
  ConversationKind,
  ConversationSnapshot,
  ConversationSummary,
  ContextUsage,
  DeliveryResource,
  EventMeta,
  Feedback,
  Interaction,
  Item,
  Operation,
  QueueEntry,
  RoomId,
  RoomResource,
  ServerCapabilities,
  SessionSnapshot,
  SessionSummary,
  TaskResource,
  Turn
} from '../../../shared/contracts/appServer'

export type ConversationKey =
  | { kind: 'main' }
  | { kind: 'agent'; agentId: AgentId }
  | { kind: 'room'; roomId: RoomId }

export type ActiveCollection<T> = {
  count: number
  revision: number
  active: T[]
}

export type TranscriptProjection = {
  log: Item[]
  live: Item[]
  generation: number
  tail: Map<ItemId, CommandTail>
  contextUsage: ContextUsage | null
  queue: QueueEntry[]
  queueRevision: number
}

export type AppStore = {
  connectionEpoch: string | null
  session: SessionSummary | null
  capabilities: ServerCapabilities | null
  config: ConfigSnapshot | null
  conversations: Map<ConversationId, ConversationSummary>
  keysByConversation: Map<ConversationId, ConversationKey>
  conversationsByKey: Map<string, ConversationId>
  turns: Map<string, Turn>
  interactions: Interaction[]
  operations: Operation[]
  feedback: Feedback[]
  transcripts: Map<ConversationId, TranscriptProjection>
  agents: ActiveCollection<AgentResource> & { byId: Map<AgentId, AgentResource> }
  rooms: ActiveCollection<RoomResource> & { byId: Map<RoomId, RoomResource> }
  tasks: ActiveCollection<TaskResource> & { byId: Map<string, TaskResource> }
  deliveries: ActiveCollection<DeliveryResource> & { byId: Map<string, DeliveryResource> }
  commands: ActiveCollection<BackgroundCommandResource> & { byId: Map<string, BackgroundCommandResource> }
  lastEventCursor: number | null
  desynchronized: boolean
}

export const initialAppStore: AppStore = {
  connectionEpoch: null,
  session: null,
  capabilities: null,
  config: null,
  conversations: new Map(),
  keysByConversation: new Map(),
  conversationsByKey: new Map(),
  turns: new Map(),
  interactions: [],
  operations: [],
  feedback: [],
  transcripts: new Map(),
  agents: emptyCollection(),
  rooms: emptyCollection(),
  tasks: emptyCollection(),
  deliveries: emptyCollection(),
  commands: emptyCollection(),
  lastEventCursor: null,
  desynchronized: false
}

export function applySessionSnapshot(state: AppStore, snapshot: SessionSnapshot): AppStore {
  const next = emptyStore()
  next.connectionEpoch = snapshot.session.epoch
  next.session = snapshot.session
  next.capabilities = snapshot.capabilities
  next.config = snapshot.config
  next.interactions = [...snapshot.interactions]
  next.operations = [...snapshot.operations]
  next.feedback = [...snapshot.feedback]
  for (const conversation of snapshot.conversations.active) {
    addConversation(next, conversation)
  }
  next.agents = fromActiveCollection(snapshot.collections.agents)
  next.rooms = fromActiveCollection(snapshot.collections.rooms)
  next.tasks = fromActiveCollection(snapshot.collections.tasks)
  next.deliveries = fromActiveCollection(snapshot.collections.deliveries)
  next.commands = fromActiveCollection(snapshot.collections.backgroundCommands)
  for (const turn of snapshot.activeTurns) next.turns.set(turn.id, turn)
  next.lastEventCursor = snapshot.eventCursor
  return next
}

export function applyConversationSnapshot(state: AppStore, conversationId: ConversationId, snapshot: ConversationSnapshot): AppStore {
  const next = cloneStore(state)
  next.desynchronized = false
  const existing = next.transcripts.get(conversationId)
  next.transcripts.set(conversationId, {
    log: [...snapshot.items.items],
    live: [],
    generation: snapshot.historyGeneration,
    tail: existing?.tail ?? new Map(),
    contextUsage: snapshot.contextUsage ?? null,
    queue: [...snapshot.queue.items],
    queueRevision: snapshot.queue.revision
  })
  if (snapshot.activeTurn) next.turns.set(snapshot.activeTurn.id, snapshot.activeTurn)
  for (const interaction of snapshot.interactions) upsertInteraction(next, interaction)
  next.conversations.set(conversationId, snapshot.conversation)
  indexConversation(next, conversationId, snapshot.conversation)
  next.lastEventCursor = snapshot.eventCursor
  return next
}

export function markDesynchronized(state: AppStore): AppStore {
  return { ...cloneStore(state), desynchronized: true }
}

export function applyNotification(state: AppStore, notification: AppServerNotification): AppStore {
  const next = cloneStore(state)
  const cursor = eventCursor(notification.params)
  if (cursor !== null) next.lastEventCursor = Math.max(next.lastEventCursor ?? 0, cursor)
  switch (notification.method) {
    case 'session/updated':
      next.session = notification.params.session
      break
    case 'session/closed':
    case 'session/deleted':
      next.session = null
      break
    case 'conversation/created':
    case 'conversation/updated':
      upsertConversation(next, notification.params.conversation)
      break
    case 'conversation/removed':
      removeConversation(next, notification.params.conversationId)
      break
    case 'turn/started':
      next.turns.set(notification.params.turn.id, notification.params.turn)
      break
    case 'turn/roundStarted':
    case 'turn/roundCompleted':
      next.turns.delete(notification.params.turnId)
      break
    case 'turn/retrying':
      withdrawItems(next, notification.params.conversationId, notification.params.removedItemIds)
      break
    case 'turn/usageUpdated': {
      const transcript = next.transcripts.get(notification.params.conversationId)
      if (transcript?.contextUsage && notification.params.contextUsage) {
        next.transcripts.set(notification.params.conversationId, { ...transcript, contextUsage: notification.params.contextUsage })
      }
      break
    }
    case 'turn/completed':
      next.turns.set(notification.params.turn.id, notification.params.turn)
      break
    case 'item/started':
    case 'item/updated':
      upsertLiveItem(next, notification.params.conversationId, notification.params.item)
      break
    case 'item/textDelta':
      appendItemDelta(next, notification.params.conversationId, notification.params.itemId, notification.params.delta, false)
      break
    case 'item/reasoningDelta':
      appendItemDelta(next, notification.params.conversationId, notification.params.itemId, notification.params.delta, true)
      break
    case 'item/commandTailUpdated':
      setCommandTail(next, notification.params.conversationId, notification.params.itemId, notification.params.tail)
      break
    case 'item/completed':
      commitItem(next, notification.params.conversationId, notification.params.item)
      break
    case 'queue/itemAdded':
      addQueueEntry(next, notification.params.conversationId, notification.params.entry, notification.params.position, notification.params.revision)
      break
    case 'queue/itemRemoved':
      removeQueueEntry(next, notification.params.conversationId, notification.params.queueId, notification.params.revision)
      break
    case 'queue/itemAbsorbed':
      removeQueueEntry(next, notification.params.conversationId, notification.params.queueId, notification.params.revision)
      break
    case 'interaction/opened':
      upsertInteraction(next, notification.params.interaction)
      break
    case 'interaction/resolved':
    case 'interaction/cancelled':
      next.interactions = next.interactions.filter((interaction) => interaction.id !== notification.params.interactionId)
      break
    case 'operation/started':
    case 'operation/completed':
      upsertOperation(next, notification.params.operation)
      break
    case 'operation/progress':
      next.operations = next.operations.map((operation) => operation.id === notification.params.operationId ? { ...operation, progress: notification.params.progress } : operation)
      break
    case 'agent/changed':
      upsertById(next.agents, notification.params.agent)
      break
    case 'agent/removed':
      removeById(next.agents, notification.params.agentId)
      break
    case 'room/changed':
      upsertById(next.rooms, notification.params.room)
      break
    case 'task/changed':
      upsertById(next.tasks, notification.params.task)
      break
    case 'task/removed':
      removeById(next.tasks, notification.params.taskId)
      break
    case 'delivery/changed':
      upsertById(next.deliveries, notification.params.delivery)
      break
    case 'command/changed':
      upsertById(next.commands, notification.params.command)
      break
    case 'config/changed':
      next.config = notification.params.config
      break
    case 'feedback/raised':
      next.feedback = [...next.feedback.filter((feedback) => feedback.id !== notification.params.feedback.id), notification.params.feedback]
      break
    case 'feedback/cleared':
      next.feedback = next.feedback.filter((feedback) => feedback.id !== notification.params.feedbackId)
      break
    default:
      break
  }
  return next
}

export function conversationKey(kind: ConversationKind): ConversationKey {
  if (kind.type === 'main') return { kind: 'main' }
  if (kind.type === 'agent') return { kind: 'agent', agentId: kind.agentId }
  return { kind: 'room', roomId: kind.roomId }
}

export function keyId(key: ConversationKey): string {
  if (key.kind === 'main') return 'main'
  if (key.kind === 'agent') return `agent:${key.agentId}`
  return `room:${key.roomId}`
}

export function selectMainConversation(state: AppStore): ConversationSummary | null {
  return [...state.conversations.values()].find((conversation) => conversation.kind.type === 'main') ?? null
}

export function selectConversationByKey(state: AppStore, key: ConversationKey): ConversationSummary | null {
  const id = state.conversationsByKey.get(keyId(key))
  return id ? state.conversations.get(id) ?? null : null
}

export function selectConversationTranscript(state: AppStore, conversationId: ConversationId): TranscriptProjection | null {
  return state.transcripts.get(conversationId) ?? null
}

export function selectConversationItems(state: AppStore, conversationId: ConversationId): Item[] {
  const transcript = state.transcripts.get(conversationId)
  return transcript ? [...transcript.log, ...transcript.live] : []
}

export function selectInteractionFor(state: AppStore, conversationId: ConversationId): Interaction[] {
  return state.interactions.filter((interaction) => interaction.conversationId === conversationId)
}

function emptyStore(): AppStore {
  return {
    ...initialAppStore,
    conversations: new Map(),
    keysByConversation: new Map(),
    conversationsByKey: new Map(),
    turns: new Map(),
    transcripts: new Map(),
    agents: emptyCollection(),
    rooms: emptyCollection(),
    tasks: emptyCollection(),
    deliveries: emptyCollection(),
    commands: emptyCollection()
  }
}

function cloneStore(state: AppStore): AppStore {
  return {
    ...state,
    conversations: new Map(state.conversations),
    keysByConversation: new Map(state.keysByConversation),
    conversationsByKey: new Map(state.conversationsByKey),
    turns: new Map(state.turns),
    interactions: [...state.interactions],
    operations: [...state.operations],
    feedback: [...state.feedback],
    transcripts: new Map(state.transcripts),
    agents: cloneCollection(state.agents),
    rooms: cloneCollection(state.rooms),
    tasks: cloneCollection(state.tasks),
    deliveries: cloneCollection(state.deliveries),
    commands: cloneCollection(state.commands)
  }
}

function emptyCollection<T extends { id: string }>(): ActiveCollection<T> & { byId: Map<string, T> } {
  return { count: 0, revision: 0, active: [], byId: new Map() }
}

function fromActiveCollection<T extends { id: string }>(collection: { active: T[]; count: number; revision: number }): ActiveCollection<T> & { byId: Map<string, T> } {
  return {
    count: collection.count,
    revision: collection.revision,
    active: [...collection.active],
    byId: new Map(collection.active.map((item) => [item.id, item]))
  }
}

function cloneCollection<T extends { id: string }>(collection: ActiveCollection<T> & { byId: Map<string, T> }): ActiveCollection<T> & { byId: Map<string, T> } {
  return { count: collection.count, revision: collection.revision, active: [...collection.active], byId: new Map(collection.byId) }
}

function upsertById<T extends { id: string }>(collection: ActiveCollection<T> & { byId: Map<string, T> }, value: T): void {
  const index = collection.active.findIndex((item) => item.id === value.id)
  if (index >= 0) collection.active[index] = value
  else collection.active = [...collection.active, value]
  collection.byId.set(value.id, value)
}

function removeById<T extends { id: string }>(collection: ActiveCollection<T> & { byId: Map<string, T> }, id: string): void {
  collection.active = collection.active.filter((item) => item.id !== id)
  collection.byId.delete(id)
}

function addConversation(state: AppStore, conversation: ConversationSummary): void {
  upsertConversation(state, conversation)
}

function upsertConversation(state: AppStore, conversation: ConversationSummary): void {
  const previous = state.conversations.get(conversation.id)
  state.conversations.set(conversation.id, conversation)
  if (!state.transcripts.has(conversation.id)) {
    state.transcripts.set(conversation.id, emptyTranscript())
  }
  if (!previous || keyId(conversationKey(previous.kind)) !== keyId(conversationKey(conversation.kind))) {
    indexConversation(state, conversation.id, conversation)
  }
}

function indexConversation(state: AppStore, id: ConversationId, conversation: ConversationSummary): void {
  const key = conversationKey(conversation.kind)
  const keyString = keyId(key)
  const previousKey = state.keysByConversation.get(id)
  if (previousKey) state.conversationsByKey.delete(keyId(previousKey))
  state.keysByConversation.set(id, key)
  state.conversationsByKey.set(keyString, id)
}

function removeConversation(state: AppStore, id: ConversationId): void {
  const key = state.keysByConversation.get(id)
  if (key) state.conversationsByKey.delete(keyId(key))
  state.keysByConversation.delete(id)
  state.conversations.delete(id)
  state.transcripts.delete(id)
}

function upsertLiveItem(state: AppStore, conversationId: ConversationId, item: Item): void {
  const transcript = state.transcripts.get(conversationId) ?? emptyTranscript()
  const liveIndex = transcript.live.findIndex((candidate) => candidate.id === item.id)
  if (liveIndex >= 0) transcript.live[liveIndex] = item
  else transcript.live.push(item)
  state.transcripts.set(conversationId, transcript)
}

function appendItemDelta(state: AppStore, conversationId: ConversationId, itemId: string, delta: string, reasoning: boolean): void {
  const transcript = state.transcripts.get(conversationId)
  if (!transcript) return
  const index = transcript.live.findIndex((item) => item.id === itemId)
  if (index < 0) return
  const item = transcript.live[index]
  if (reasoning && item.type === 'reasoning') {
    transcript.live[index] = { ...item, text: `${item.text}${delta}` }
  } else if (!reasoning && item.type === 'assistantMessage') {
    transcript.live[index] = { ...item, text: `${item.text}${delta}` }
  }
  state.transcripts.set(conversationId, transcript)
}

function setCommandTail(state: AppStore, conversationId: ConversationId, itemId: string, tail: CommandTail): void {
  const transcript = state.transcripts.get(conversationId)
  if (!transcript) return
  transcript.tail.set(itemId, tail)
  state.transcripts.set(conversationId, transcript)
}

function commitItem(state: AppStore, conversationId: ConversationId, item: Item): void {
  const transcript = state.transcripts.get(conversationId) ?? emptyTranscript()
  transcript.live = transcript.live.filter((candidate) => candidate.id !== item.id)
  const logIndex = transcript.log.findIndex((candidate) => candidate.id === item.id)
  if (logIndex >= 0) transcript.log[logIndex] = item
  else transcript.log.push(item)
  transcript.tail.delete(item.id)
  state.transcripts.set(conversationId, transcript)
}

function withdrawItems(state: AppStore, conversationId: ConversationId, removed: ItemId[]): void {
  if (removed.length === 0) return
  const transcript = state.transcripts.get(conversationId)
  if (!transcript) return
  transcript.live = transcript.live.filter((item) => !removed.includes(item.id))
  transcript.log = transcript.log.filter((item) => !removed.includes(item.id))
  for (const id of removed) transcript.tail.delete(id)
  state.transcripts.set(conversationId, transcript)
}

function addQueueEntry(state: AppStore, conversationId: ConversationId, entry: QueueEntry, position: number, revision: number): void {
  const transcript = state.transcripts.get(conversationId) ?? emptyTranscript()
  transcript.queue = transcript.queue.filter((candidate) => candidate.id !== entry.id)
  transcript.queue.splice(Math.min(position, transcript.queue.length), 0, entry)
  transcript.queueRevision = revision
  state.transcripts.set(conversationId, transcript)
}

function removeQueueEntry(state: AppStore, conversationId: ConversationId, queueId: string, revision: number): void {
  const transcript = state.transcripts.get(conversationId)
  if (!transcript) return
  transcript.queue = transcript.queue.filter((entry) => entry.id !== queueId)
  transcript.queueRevision = revision
  state.transcripts.set(conversationId, transcript)
}

function upsertInteraction(state: AppStore, interaction: Interaction): void {
  state.interactions = [...state.interactions.filter((candidate) => candidate.id !== interaction.id), interaction]
}

function upsertOperation(state: AppStore, operation: Operation): void {
  state.operations = [...state.operations.filter((candidate) => candidate.id !== operation.id), operation]
}

function eventCursor(params: unknown): number | null {
  if (typeof params !== 'object' || params === null || !('event' in params)) return null
  const event = (params as { event?: Partial<EventMeta> }).event
  return typeof event?.seq === 'number' ? event.seq : null
}

function emptyTranscript(): TranscriptProjection {
  return { log: [], live: [], generation: 0, tail: new Map(), contextUsage: null, queue: [], queueRevision: 0 }
}
