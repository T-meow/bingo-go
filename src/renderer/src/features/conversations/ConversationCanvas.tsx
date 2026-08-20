import { Empty } from 'antd'
import { NumberOutlined, RobotOutlined } from '@ant-design/icons'
import type { ConversationSummary, Interaction, InteractionDecision, Item, QueueEntry, Turn } from '../../../../shared/contracts/appServer'
import { Composer, type ComposerAttachment, type ComposerRuntime } from './Composer'
import { InteractionCard } from './InteractionCard'
import { ItemRenderer } from './ItemRenderer'
import { TurnGroup } from './TurnGroup'

export function ConversationCanvas({ conversation, items, interactions, turn, queue, composer, onRespond }: {
  conversation: ConversationSummary | null
  items: Item[]
  interactions: Interaction[]
  turn: Turn | null
  queue: QueueEntry[]
  composer: {
    value: string
    onChange: (value: string) => void
    loading: boolean
    onSubmit: (text: string) => void
    onCancel: () => void
    shellMode: boolean
    onShellModeChange: (shell: boolean) => void
    allowShell: boolean
    runtime?: ComposerRuntime
    onReclaimTail: () => void
    attachments: ComposerAttachment[]
  }
  onRespond: (interaction: Interaction, decision: InteractionDecision, activation: 'pointer' | 'keyboard') => void
}): React.JSX.Element {
  return (
    <div className="conversation-canvas" data-testid="conversation-canvas">
      <header className="conversation-header">
        <div className="conversation-heading-v2">
          <span>{conversationKindLabel(conversation)}</span>
          <h1>{conversation?.title ?? '主任务'}</h1>
        </div>
        {conversation && <div className="conversation-signals-v2">
          <span className={`run-state-v2 is-${conversation.runState}`}><i />{runStateLabel(conversation.runState)}</span>
          {conversation.pendingInteractions > 0 && <span className="signal-pill-v2 is-warning">待确认 {conversation.pendingInteractions}</span>}
          {queue.length > 0 && <span className="signal-pill-v2">队列 {queue.length}</span>}
        </div>}
      </header>
      <section className="conversation-scroll">
        <TurnGroup turn={turn}>
          {items.length === 0 && interactions.length === 0 && (
            <Empty
              className="conversation-empty-state-v2"
              image={conversation?.kind.type === 'room' ? <NumberOutlined /> : <RobotOutlined />}
              description="还没有任务记录"
            />
          )}
          {items.map((item) => <ItemRenderer key={item.id} item={item} />)}
        </TurnGroup>
        {interactions.map((interaction) => <InteractionCard key={interaction.id} interaction={interaction} onRespond={(decision, activation) => onRespond(interaction, decision, activation)} />)}
      </section>
      <Composer
        value={composer.value}
        onChange={composer.onChange}
        loading={composer.loading}
        onSubmit={composer.onSubmit}
        onCancel={composer.onCancel}
        shellMode={composer.shellMode}
        onShellModeChange={composer.onShellModeChange}
        allowShell={composer.allowShell}
        audience={conversation?.title ?? '当前会话'}
        runtime={composer.runtime}
        queue={queue}
        onReclaimTail={composer.onReclaimTail}
        attachments={composer.attachments}
      />
    </div>
  )
}

function conversationKindLabel(conversation: ConversationSummary | null): string {
  if (!conversation || conversation.kind.type === 'main') return '主 Agent'
  if (conversation.kind.type === 'agent') return '子 Agent'
  return '协作房间'
}

function runStateLabel(state: ConversationSummary['runState']): string {
  const labels: Record<ConversationSummary['runState'], string> = {
    idle: '就绪',
    running: '执行中',
    stopped: '已停止',
    passive: '监听中'
  }
  return labels[state]
}
