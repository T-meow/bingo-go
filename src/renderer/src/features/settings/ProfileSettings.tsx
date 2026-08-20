import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Space } from 'antd'
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { GEOMETRIC_AVATAR_IDS } from '../../../../shared/avatars'
import type { UserProfileAvatarInput } from '../../../../shared/contracts/ipc'
import { AvatarPicker } from '../../components/AvatarPicker'
import { IdentityAvatar } from '../../components/IdentityAvatar'
import { useUserProfile } from '../../profile/UserProfileProvider'
import { SettingsSectionLayout, type SettingsSectionTransaction } from './AppearanceSettings'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export function ProfileSettings({ onTransactionChange }: { onTransactionChange?: (transaction: SettingsSectionTransaction | null) => void }): React.JSX.Element {
  const profile = useUserProfile()
  const savedAvatar = profile.snapshot?.values.avatar ?? ''
  const [avatar, setAvatar] = useState(savedAvatar)
  const [avatarDataUrl, setAvatarDataUrl] = useState(profile.snapshot?.avatarDataUrl)
  const [pending, setPending] = useState<UserProfileAvatarInput | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setAvatar(savedAvatar)
    setAvatarDataUrl(profile.snapshot?.avatarDataUrl)
    setPending(null)
  }, [profile.snapshot?.revision, profile.snapshot?.avatarDataUrl, savedAvatar])

  const dirty = pending !== null
  const discard = useCallback((): void => {
    setAvatar(savedAvatar)
    setAvatarDataUrl(profile.snapshot?.avatarDataUrl)
    setPending(null)
    setLocalError(null)
  }, [profile.snapshot?.avatarDataUrl, savedAvatar])
  const save = useCallback(async (): Promise<boolean> => {
    if (!pending) return true
    const ok = await profile.save(pending)
    if (ok) setPending(null)
    return ok
  }, [pending, profile.save])
  useEffect(() => {
    onTransactionChange?.(dirty ? { save, discard } : null)
    return () => onTransactionChange?.(null)
  }, [dirty, discard, onTransactionChange, save])

  const choose = (next: string): void => {
    setAvatar(next)
    setAvatarDataUrl(undefined)
    setPending({ kind: 'builtin', id: next })
    setLocalError(null)
  }
  const random = (): void => {
    const choices = GEOMETRIC_AVATAR_IDS.filter((id) => id !== avatar)
    choose(choices[Math.floor(Math.random() * choices.length)] ?? GEOMETRIC_AVATAR_IDS[0])
  }
  const upload = async (file: File): Promise<void> => {
    setLocalError(null)
    try {
      const normalized = await normalizeAvatar(file)
      setAvatar('pending-upload')
      setAvatarDataUrl(normalized.dataUrl)
      setPending({ kind: 'upload', fileName: `${file.name}.png`, data: normalized.base64 })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '无法处理头像图片')
    }
  }
  const error = localError ?? profile.error?.msg
  const currentTitle = useMemo(() => avatar.startsWith('user:') || avatar === 'pending-upload' ? '自定义头像' : avatar, [avatar])

  return <SettingsSectionLayout title="个人资料" description="设置你在 Bingo Go 本地界面和协作会话中的头像。">
    {error && <Alert type="error" showIcon title="头像不可用" description={error} />}
    <div className="profile-avatar-hero">
      <IdentityAvatar avatar={avatar} avatarDataUrl={avatarDataUrl} identity="user" size={88} />
      <div><strong>{currentTitle || '正在读取'}</strong><span>头像只保存在本机，不会写入项目配置。</span></div>
    </div>
    <AvatarPicker value={avatar} identity="user" disabled={!profile.snapshot || profile.saving} allowUpload onChange={choose} onUpload={(file) => void upload(file)} onRandom={random} />
    <Space className="settings-actions">
      <Button icon={<ReloadOutlined />} disabled={!dirty || profile.saving} onClick={discard}>放弃更改</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={profile.saving} disabled={!dirty || profile.saving} onClick={() => void save()}>保存个人资料</Button>
    </Space>
  </SettingsSectionLayout>
}

async function normalizeAvatar(file: File): Promise<{ dataUrl: string; base64: string }> {
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) throw new Error('头像原文件必须小于 20 MiB。')
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('仅支持 PNG、JPEG 或 WebP。')
  const source = URL.createObjectURL(file)
  try {
    const image = await loadImage(source)
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    if (side < 1) throw new Error('图片尺寸无效。')
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前环境无法处理图片。')
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512)
    const dataUrl = canvas.toDataURL('image/png')
    return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }
  } finally {
    URL.revokeObjectURL(source)
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法解码头像图片。'))
    image.src = source
  })
}
