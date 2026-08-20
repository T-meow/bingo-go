import { Alert, Card, Descriptions, Tag, Typography } from 'antd'
import { Bubble, Think } from '@ant-design/x'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Item } from '../../../../shared/contracts/appServer'

export function ItemRenderer({ item }: { item: Item }): React.JSX.Element {
  switch (item.type) {
    case 'userMessage':
      return <Bubble placement="end" variant="filled" content={<Markdown remarkPlugins={[remarkGfm]}>{item.text}</Markdown>} />
    case 'assistantMessage':
      return <Bubble placement="start" variant="outlined" streaming={item.status === 'streaming'} content={<Markdown remarkPlugins={[remarkGfm]}>{item.text}</Markdown>} />
    case 'reasoning':
      return <Think title="思考过程" loading={item.status === 'streaming'} defaultExpanded={false}>{item.text}</Think>
    case 'peerMessage':
      return <Bubble placement="start" avatar={item.from} header={<span>{item.from}{item.to ? ` → ${item.to}` : ''}</span>} content={<Markdown remarkPlugins={[remarkGfm]}>{item.text}</Markdown>} />
    case 'roomMessage':
      return <Bubble placement="start" avatar={item.from} header={<span>{item.from} <small>#{item.roomSeq}</small></span>} content={<Markdown remarkPlugins={[remarkGfm]}>{item.text}</Markdown>} />
    case 'toolCall':
      return <ToolCallItem item={item} />
    case 'command':
      return <CommandItem item={item} />
    case 'compaction':
      return <Bubble.System content={<Descriptions size="small" column={2} items={[
        { key: 'before', label: 'Before', children: item.beforeTokens },
        { key: 'after', label: 'After', children: item.afterTokens },
        { key: 'replaced', label: 'Replaced', children: item.replacedMessages },
        { key: 'duration', label: 'Duration', children: `${item.durationMs} ms` }
      ]} />} />
    case 'rewind':
      return <Bubble.System content={`History was rewound; ${item.removedItems} item(s) removed.`} />
    case 'interruption':
      return <Bubble.System content={item.marker} />
    case 'notice':
      return <Alert type={item.level === 'error' ? 'error' : item.level === 'warning' ? 'warning' : 'info'} showIcon message={item.text} />
    case 'questionAnswer':
      return <Bubble placement="end" content={<div><strong>{item.question}</strong><p>{item.answer}</p></div>} />
    case 'permissionReceipt':
      return <Bubble.System content={<span>Permission: <Tag>{item.decision}</Tag> {item.tool}{item.feedback ? ` — ${item.feedback}` : ''}</span>} />
    case 'asset':
      return <Card size="small"><Typography.Text code>{item.assetId}</Typography.Text></Card>
    default:
      return <Bubble.System content={JSON.stringify(item)} />
  }
}

function ToolCallItem({ item }: { item: Extract<Item, { type: 'toolCall' }> }): React.JSX.Element {
  return (
    <Card size="small" className={`tool-item tool-${item.status}`} title={<span>{item.name} <Tag>{item.status}</Tag></span>} extra={item.durationMs > 0 ? `${item.durationMs} ms` : undefined}>
      {item.summary && <Typography.Paragraph>{item.summary}</Typography.Paragraph>}
      {item.output && <pre className="tool-output">{item.output}</pre>}
      {item.diff && <pre className="tool-diff">{item.diff}</pre>}
    </Card>
  )
}

function CommandItem({ item }: { item: Extract<Item, { type: 'command' }> }): React.JSX.Element {
  return (
    <Card size="small" className="command-item" title={<span>Shell {item.background && <Tag>background</Tag>}</span>} extra={item.exitCode === null ? undefined : `exit ${item.exitCode}`}>
      <pre className="command-tail">{item.tail?.lines.join('\n') ?? item.output}</pre>
    </Card>
  )
}
