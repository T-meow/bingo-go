import { Button, Upload } from 'antd'
import { ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { BUILTIN_AVATAR_IDS } from '../../../shared/avatars'
import { IdentityAvatar } from './IdentityAvatar'

export function AvatarPicker({ value, identity, disabled, allowUpload = false, extraAvatars = [], onChange, onUpload, onRandom }: {
  value?: string
  identity: string
  disabled?: boolean
  allowUpload?: boolean
  onChange: (avatar: string) => void
  onUpload?: (file: File) => void
  onRandom?: () => void
  extraAvatars?: Array<{ id: string; dataUrl?: string }>
}): React.JSX.Element {
  return <div className="avatar-picker">
    <div className="avatar-picker-grid" role="listbox" aria-label="选择头像">
      {BUILTIN_AVATAR_IDS.map((avatar) => <button
        type="button"
        key={avatar}
        className={`avatar-picker-item${value === avatar ? ' selected' : ''}`}
        role="option"
        aria-selected={value === avatar}
        title={avatar}
        disabled={disabled}
        onClick={() => onChange(avatar)}
      ><IdentityAvatar avatar={avatar} identity={`${identity}:${avatar}`} size={44} /></button>)}
      {extraAvatars.map(({ id, dataUrl }) => <button
        type="button"
        key={id}
        className={`avatar-picker-item${value === id ? ' selected' : ''}`}
        role="option"
        aria-selected={value === id}
        title="项目头像"
        disabled={disabled}
        onClick={() => onChange(id)}
      ><IdentityAvatar avatar={id} avatarDataUrl={dataUrl} identity={`${identity}:${id}`} size={44} /></button>)}
    </div>
    {(allowUpload || onRandom) && <div className="avatar-picker-actions">
      {onRandom && <Button icon={<ReloadOutlined />} disabled={disabled} onClick={onRandom}>随机换一个</Button>}
      {allowUpload && <Upload accept="image/png,image/jpeg,image/webp" maxCount={1} showUploadList={false} beforeUpload={(file) => { onUpload?.(file); return false }}><Button icon={<UploadOutlined />} disabled={disabled}>上传本地头像</Button></Upload>}
    </div>}
  </div>
}
