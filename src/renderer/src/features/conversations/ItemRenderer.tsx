import { Alert, Avatar, Descriptions, Tag, Typography } from 'antd'
import { Bubble, Think } from '@ant-design/x'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  FileOutlined,
  LoadingOutlined,
  RobotOutlined,
  StopOutlined,
  ToolOutlined
} from '@ant-design/icons'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Item } from '../../../../shared/contracts/appServer'

export function ItemRenderer({ item }: { item: Item }): React.JSX.Element {
  switch (item.type) {
    case 'userMessage':
      return <Bubble className="agent-message-v2 agent-message-user-v2" placement="end" variant="filled" content={<MarkdownContent text={item.text} />} />
    case 'assistantMessage':
      return <Bubble
        className="agent-message-v2 agent-message-assistant-v2"
        placement="start"
        variant="borderless"
        avatar={<Avatar className="agent-message-avatar-v2" size={28} icon={<RobotOutlined />} />}
        streaming={item.status === 'streaming'}
        content={<MarkdownContent text={item.text} />}
      />
    case 'reasoning':
      return <Think className="agent-reasoning-v2" title="思考过程" loading={item.status === 'streaming'} defaultExpanded={false}>{item.text}</Think>
    case 'peerMessage':
      return <Bubble className="agent-message-v2 agent-message-peer-v2" placement="start" avatar={<Avatar size={28}>{initial(item.from)}</Avatar>} header={<span>{item.from}{item.to ? ` → ${item.to}` : ''}</span>} content={<MarkdownContent text={item.text} />} />
    case 'roomMessage':
      return <Bubble className="agent-message-v2 agent-message-peer-v2" placement="start" avatar={<Avatar size={28}>{initial(item.from)}</Avatar>} header={<span>{item.from} <small>#{item.roomSeq}</small></span>} content={<MarkdownContent text={item.text} />} />
    case 'toolCall':
      return <ToolCallItem item={item} />
    case 'command':
      return <CommandItem item={item} />
    case 'compaction':
      return <Bubble.System content={<Descriptions size="small" column={2} items={[
        { key: 'before', label: '压缩前', children: item.beforeTokens },
        { key: 'after', label: '压缩后', children: item.afterTokens },
        { key: 'replaced', label: '替换消息', children: item.replacedMessages },
        { key: 'duration', label: '耗时', children: `${item.durationMs} ms` }
      ]} />} />
    case 'rewind':
      return <Bubble.System content={`历史已回退，移除 ${item.removedItems} 条记录。`} />
    case 'interruption':
      return <Bubble.System content={item.marker} />
    case 'notice':
      return <Alert type={item.level === 'error' ? 'error' : item.level === 'warning' ? 'warning' : 'info'} showIcon title={item.text} />
    case 'questionAnswer':
      return <Bubble placement="end" content={<div><strong>{item.question}</strong><p>{item.answer}</p></div>} />
    case 'permissionReceipt':
      return <Bubble.System content={<span>权限：<Tag>{permissionDecisionLabel(item.decision)}</Tag> {item.tool}{item.feedback ? ` · ${item.feedback}` : ''}</span>} />
    case 'asset':
      return <div className="agent-asset-v2"><FileOutlined /><span>{item.label ?? '资源'}</span><Typography.Text code>{item.assetId}</Typography.Text></div>
    default:
      return <Bubble.System content={JSON.stringify(item)} />
  }
}

function ToolCallItem({ item }: { item: Extract<Item, { type: 'toolCall' }> }): React.JSX.Element {
  const state = itemState(item.status)
  return (
    <article className={`agent-tool-call-v2 is-${item.status}`}>
      <header>
        <span className="agent-tool-icon-v2"><ToolOutlined /></span>
        <span className="agent-tool-copy-v2">
          <strong>{item.name}</strong>
          <small>{item.summary || '工具调用'}</small>
        </span>
        <span className="agent-tool-state-v2">{state.icon}{state.label}</span>
        {item.durationMs > 0 && <time>{formatDuration(item.durationMs)}</time>}
      </header>
      {(item.output || item.diff) && <details className="agent-tool-details-v2">
        <summary>执行详情</summary>
        {item.output && <pre className="tool-output">{item.output}</pre>}
        {item.diff && <><span className="tool-detail-label-v2">变更</span><pre className="tool-diff">{item.diff}</pre></>}
      </details>}
    </article>
  )
}

function CommandItem({ item }: { item: Extract<Item, { type: 'command' }> }): React.JSX.Element {
  const state = itemState(item.status)
  const output = item.tail?.lines.join('\n') ?? item.output
  return (
    <article className={`agent-tool-call-v2 agent-command-v2 is-${item.status}`}>
      <header>
        <span className="agent-tool-icon-v2"><CodeOutlined /></span>
        <span className="agent-tool-copy-v2">
          <strong>终端命令{item.background && <Tag>后台</Tag>}</strong>
          <code title={item.command}>{item.command}</code>
        </span>
        <span className="agent-tool-state-v2">{state.icon}{item.exitCode === null || item.exitCode === undefined ? state.label : `exit ${item.exitCode}`}</span>
        {item.durationMs > 0 && <time>{formatDuration(item.durationMs)}</time>}
      </header>
      {output && <details className="agent-tool-details-v2">
        <summary>终端输出</summary>
        <pre className="command-tail">{output}</pre>
      </details>}
    </article>
  )
}

function MarkdownContent({ text }: { text: string }): React.JSX.Element {
  return <div className="markdown-body"><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
}

function initial(value: string): string {
  return Array.from(value.trim())[0]?.toLocaleUpperCase() ?? 'A'
}

function itemState(status: Item['status']): { label: string; icon: React.ReactNode } {
  if (status === 'streaming' || status === 'pending') return { label: status === 'streaming' ? '执行中' : '等待中', icon: <LoadingOutlined spin={status === 'streaming'} /> }
  if (status === 'completed') return { label: '完成', icon: <CheckCircleOutlined /> }
  if (status === 'failed') return { label: '失败', icon: <CloseCircleOutlined /> }
  return { label: '已取消', icon: <StopOutlined /> }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`
  return `${Math.floor(durationMs / 60_000)}m ${Math.floor((durationMs % 60_000) / 1_000)}s`
}

function permissionDecisionLabel(decision: string): string {
  if (decision === 'allowOnce') return '允许一次'
  if (decision === 'allowSession') return '本次会话允许'
  if (decision === 'deny') return '已拒绝'
  return decision
}
