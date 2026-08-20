import { useState } from 'react'
import { Button, Card, Input, Radio, Space, Tag } from 'antd'
import type { Interaction, InteractionDecision } from '../../../../shared/contracts/appServer'

export function InteractionCard({ interaction, onRespond }: {
  interaction: Interaction
  onRespond: (decision: InteractionDecision, activation: 'pointer' | 'keyboard') => void
}): React.JSX.Element {
  const prompt = interaction.prompt
  const [feedback, setFeedback] = useState('')
  const [freeText, setFreeText] = useState('')
  return (
    <Card size="small" className="interaction-card" title={prompt.title}>
      {prompt.type === 'permission' && (() => {
        const sessionScope = prompt.sessionScope
        return <Space orientation="vertical" size={10} className="interaction-body">
          <span className="interaction-summary-v2">{prompt.reason ?? prompt.tool.name}</span>
          {prompt.preview?.type === 'command' && <pre>{prompt.preview.command}</pre>}
          {prompt.allowsFeedback && prompt.decisions.includes('deny') && (
            <Input
              className="interaction-feedback-v2"
              placeholder="拒绝原因（可选）"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          )}
          <Space wrap className="interaction-actions-v2">
            {prompt.decisions.includes('allowOnce') && <Button type="primary" onClick={() => onRespond({ type: 'allowOnce' }, 'pointer')}>允许一次</Button>}
            {prompt.decisions.includes('allowSession') && sessionScope && <Button onClick={() => onRespond({ type: 'allowSession', scopeId: sessionScope.id }, 'pointer')}>允许本次会话</Button>}
            {prompt.decisions.includes('deny') && <Button danger onClick={() => onRespond({ type: 'deny', feedback: feedback || null }, 'pointer')}>拒绝</Button>}
            {interaction.remainingGuardMs > 0 && <Tag color="warning">确认保护剩余 {Math.ceil(interaction.remainingGuardMs / 1000)}s</Tag>}
          </Space>
        </Space>
      })()}
      {prompt.type === 'question' && (
        <Space orientation="vertical" size={8} className="interaction-body">
          <span>{prompt.question}</span>
          <Radio.Group className="interaction-question-options-v2" onChange={(event) => onRespond({ type: 'answer', optionId: String(event.target.value), text: null }, 'pointer')}>
            <Space orientation="vertical">
              {prompt.options.map((option) => <Radio key={option.id} value={option.id}>{option.label}{option.description && <small> · {option.description}</small>}</Radio>)}
            </Space>
          </Radio.Group>
          {prompt.allowsFreeText && <Input placeholder="其他回答" value={freeText} onChange={(event) => setFreeText(event.target.value)} onPressEnter={() => onRespond({ type: 'answer', optionId: null, text: freeText }, 'keyboard')} />}
        </Space>
      )}
      {prompt.type === 'confirmation' && (
        <Space orientation="vertical" className="interaction-body">
          <span>{prompt.detail}</span>
          <Space>
            <Button danger type="primary" onClick={() => onRespond({ type: 'confirm' }, 'pointer')}>{prompt.confirmLabel}</Button>
            <Button onClick={() => onRespond({ type: 'cancel' }, 'pointer')}>取消</Button>
          </Space>
        </Space>
      )}
    </Card>
  )
}
