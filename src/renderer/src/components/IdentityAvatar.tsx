import { createContext, useContext, useEffect, useState } from 'react'
import { Avatar } from 'antd'
import { isBuiltinAvatarId, stableGeometricAvatarId } from '../../../shared/avatars'

type AvatarResolver = (avatar: string) => Promise<string | null>
const AvatarResolverContext = createContext<AvatarResolver | null>(null)

export function AvatarDataProvider({ resolve, children }: { resolve: AvatarResolver; children: React.ReactNode }): React.JSX.Element {
  return <AvatarResolverContext.Provider value={resolve}>{children}</AvatarResolverContext.Provider>
}

export function IdentityAvatar({ avatar, avatarDataUrl, identity, size = 36, className }: {
  avatar?: string
  avatarDataUrl?: string
  identity: string
  size?: number
  className?: string
}): React.JSX.Element {
  const resolve = useContext(AvatarResolverContext)
  const [resolvedDataUrl, setResolvedDataUrl] = useState<string | undefined>(avatarDataUrl)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  useEffect(() => {
    setResolvedDataUrl(avatarDataUrl)
    setFailedSource(null)
    if (avatarDataUrl || !avatar?.startsWith('project:') || !resolve) return
    let live = true
    void resolve(avatar)
      .then((value) => { if (live && value) setResolvedDataUrl(value) })
      .catch(() => undefined)
    return () => { live = false }
  }, [avatar, avatarDataUrl, resolve])
  const fallback = stableGeometricAvatarId(identity)
  const builtin = avatar && isBuiltinAvatarId(avatar) ? avatar : fallback
  const preferredSource = resolvedDataUrl ?? `./avatars/${builtin}.png`
  const src = preferredSource === failedSource ? undefined : preferredSource
  const onError = (): boolean => {
    if (resolvedDataUrl) {
      setResolvedDataUrl(undefined)
      setFailedSource(null)
    } else setFailedSource(preferredSource)
    return false
  }
  return <Avatar className={className} size={size} src={src} alt={`${identity} 的头像`} onError={onError}>{initial(identity)}</Avatar>
}

export function SpeakerAvatar(props: Omit<React.ComponentProps<typeof IdentityAvatar>, 'size'> & { size?: number }): React.JSX.Element {
  return <IdentityAvatar {...props} size={props.size ?? 34} className={`speaker-avatar${props.className ? ` ${props.className}` : ''}`} />
}

function initial(identity: string): string {
  return Array.from(identity.trim())[0]?.toUpperCase() ?? '?'
}
