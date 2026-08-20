import { Progress } from 'antd'
import type { ContextUsage, TurnUsage } from '../../../../shared/contracts/appServer'

export function ContextPanel({ contextUsage, turnUsage }: {
  contextUsage: ContextUsage | null
  turnUsage: TurnUsage | null
}): React.JSX.Element {
  const percent = contextUsage?.window ? Math.min(100, Math.round((contextUsage.used / contextUsage.window) * 100)) : null
  return (
    <section className="context-panel" aria-label="上下文用量">
      <header>
        <div>
          <span>上下文</span>
          <strong>{percent === null ? '等待数据' : `${percent}%`}</strong>
        </div>
        {contextUsage && <small>{formatTokens(contextUsage.used)} / {formatTokens(contextUsage.window)}</small>}
      </header>
      <Progress
        percent={percent ?? 0}
        showInfo={false}
        size="small"
        status={percent !== null && percent >= 90 ? 'exception' : 'normal'}
        strokeColor={percent !== null && percent >= 75 ? '#b6873c' : 'var(--rei-accent)'}
        railColor="var(--rei-surface-subtle)"
      />
      <dl className="context-breakdown-v2">
        <div><dt>已使用</dt><dd>{contextUsage ? formatTokens(contextUsage.used) : '—'}</dd></div>
        <div><dt>窗口</dt><dd>{contextUsage ? formatTokens(contextUsage.window) : '—'}</dd></div>
        <div><dt>压缩阈值</dt><dd>{contextUsage ? formatTokens(contextUsage.trigger) : '—'}</dd></div>
      </dl>
      {turnUsage && (
        <dl className="turn-usage-v2">
          <div><dt>输入</dt><dd>{formatTokens(turnUsage.inputTokens)}</dd></div>
          <div><dt>输出</dt><dd>{formatTokens(turnUsage.outputTokens)}</dd></div>
          <div><dt>缓存读取</dt><dd>{formatTokens(turnUsage.cacheReadTokens)}</dd></div>
          <div><dt>缓存写入</dt><dd>{formatTokens(turnUsage.cacheWriteTokens)}</dd></div>
        </dl>
      )}
    </section>
  )
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}
