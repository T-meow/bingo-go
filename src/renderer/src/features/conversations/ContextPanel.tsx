import { Card, Descriptions, Progress, Statistic, Tag } from 'antd'
import type { ContextUsage, TurnUsage } from '../../../../shared/contracts/appServer'

export function ContextPanel({ contextUsage, turnUsage }: {
  contextUsage: ContextUsage | null
  turnUsage: TurnUsage | null
}): React.JSX.Element {
  const percent = contextUsage?.window ? Math.min(100, Math.round((contextUsage.used / contextUsage.window) * 100)) : null
  return (
    <Card size="small" title="Context" className="context-panel">
      {percent === null ? <Tag>暂无上下文数据</Tag> : <Progress type="dashboard" percent={percent} size={88} />}
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Used">{contextUsage?.used ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Window">{contextUsage?.window ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Trigger">{contextUsage?.trigger ?? '—'}</Descriptions.Item>
      </Descriptions>
      {turnUsage && (
        <Descriptions column={2} size="small">
          <Descriptions.Item label="Input"><Statistic value={turnUsage.inputTokens} valueStyle={{ fontSize: 13 }} /></Descriptions.Item>
          <Descriptions.Item label="Output"><Statistic value={turnUsage.outputTokens} valueStyle={{ fontSize: 13 }} /></Descriptions.Item>
          <Descriptions.Item label="Cache read"><Statistic value={turnUsage.cacheReadTokens} valueStyle={{ fontSize: 13 }} /></Descriptions.Item>
          <Descriptions.Item label="Cache write"><Statistic value={turnUsage.cacheWriteTokens} valueStyle={{ fontSize: 13 }} /></Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  )
}
