import { useEffect, useState } from 'react'
import { Alert, Skeleton } from 'antd'

export type AssetChunk = { data: string; eof: boolean; nextOffset: number }

export function AssetImage({ assetId, mime, bytes, label, loadChunk }: {
  assetId: string
  mime: string
  bytes: number
  label?: string
  loadChunk: (assetId: string, offset: number, length: number) => Promise<AssetChunk>
}): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const chunks: string[] = []
        let offset = 0
        let total = 0
        for (;;) {
          const chunk = await loadChunk(assetId, offset, 256 * 1024)
          chunks.push(chunk.data)
          total += chunk.data.length
          if (total > bytes + 1_024) throw new Error('asset chunk stream exceeded its declared size')
          if (chunk.eof) break
          offset = chunk.nextOffset
        }
        if (!cancelled) setDataUrl(`data:${mime};base64,${chunks.join('')}`)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void run()
    return () => { cancelled = true }
  }, [assetId, bytes, loadChunk, mime])

  if (error) return <Alert type="error" showIcon message={`无法读取图片 ${label ?? assetId}`} description={error} />
  if (!dataUrl) return <Skeleton.Image active />
  return <img className="asset-image" src={dataUrl} alt={label ?? assetId} />
}
