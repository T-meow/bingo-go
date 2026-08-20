import { useState } from 'react'
import { Alert, Button, Modal, Space, Typography } from 'antd'

export function RewindDialog({ open, targetLabel, busy, onPreview, onApply, onClose }: {
  open: boolean
  targetLabel: string
  busy: boolean
  onPreview: () => Promise<number | null>
  onApply: () => Promise<boolean>
  onClose: () => void
}): React.JSX.Element {
  const [previewed, setPreviewed] = useState<number | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const preview = async (): Promise<void> => {
    setPreviewBusy(true)
    try {
      setPreviewed(await onPreview())
    } finally {
      setPreviewBusy(false)
    }
  }
  const close = (): void => {
    setPreviewed(null)
    onClose()
  }

  return (
    <Modal open={open} onCancel={close} title="回退对话" okText="应用回退" cancelText="取消" confirmLoading={busy}
      okButtonProps={{ disabled: previewed === null }}
      onOk={async () => { if (await onApply()) close() }}>
      <Space direction="vertical" size={12}>
        <Typography.Paragraph>将回退到：<strong>{targetLabel}</strong>。先预览会告诉你将移除多少条目。</Typography.Paragraph>
        <Button loading={previewBusy} onClick={() => void preview()}>预览影响</Button>
        {previewed !== null && <Alert type="warning" showIcon message={`将移除 ${previewed} 个条目。`} />}
      </Space>
    </Modal>
  )
}
