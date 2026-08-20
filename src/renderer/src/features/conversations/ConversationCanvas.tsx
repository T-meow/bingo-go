import { Tag } from 'antd'
import type { ConversationSummary, ContextUsage, Interaction, InteractionDecision, Item, QueueEntry, Turn, TurnUsage } from '../../../../shared/contracts/appServer'
import { Composer, type ComposerAttachment } from './Composer'
import { ContextPanel } from './ContextPanel'
import { InteractionCard } from './InteractionCard'
import { ItemRenderer } from './ItemRenderer'
import { TurnGroup } from './TurnGroup'

export function ConversationCanvas({ conversation, items, interactions, turn, queue, contextUsage, turnUsage, composer, onRespond }: {
  conversation: ConversationSummary | null
  items: Item[]
  interactions: Interaction[]
  turn: Turn | null
  queue: QueueEntry[]
  contextUsage: ContextUsage | null
  turnUsage: TurnUsage | null
  composer: {
    value: string
    onChange: (value: string) => void
    loading: boolean
    onSubmit: (text: string) => void
    onCancel: () => void
    shellMode: boolean
    onShellModeChange: (shell: boolean) => void
    onReclaimTail: () => void
    attachments: ComposerAttachment[]
  }
  onRespond: (interaction: Interaction, decision: InteractionDecision, activation: 'pointer' | 'keyboard') => void
}): React.JSX.Element {
  return (
    <div className="conversation-canvas" data-testid="conversation-canvas">
      <header className="conversation-header">
        <strong>{conversation?.title ?? 'Main'}</strong>
        {conversation?.runState && <Tag>{conversation.runState}</Tag>}
        {conversation && conversation.unread > 0 && <Tag color="blue">{conversation.unread} unread</Tag>}
      </header>
      <section className="conversation-scroll">
        <TurnGroup turn={turn}>
          {items.map((item) => <ItemRenderer key={item.id} item={item} />)}
        </TurnGroup>
        {interactions.map((interaction) => <InteractionCard key={interaction.id} interaction={interaction} onRespond={(decision, activation) => onRespond(interaction, decision, activation)} />)}
      </section>
      <ContextPanel contextUsage={contextUsage} turnUsage={turnUsage} />
      <Composer
        value={composer.value}
        onChange={composer.onChange}
        loading={composer.loading}
        onSubmit={composer.onSubmit}
        onCancel={composer.onCancel}
        shellMode={composer.shellMode}
        onShellModeChange={composer.onShellModeChange}
        queue={queue}
        onReclaimTail={composer.onReclaimTail}
        attachments={composer.attachments}
      />
    </div>
  )
}
