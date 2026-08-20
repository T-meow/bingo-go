// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssetImage } from './AssetImage'
import { RewindDialog } from './RewindDialog'

describe('P5 renderer components', () => {
  it('loads an image asset through chunked reads', async () => {
    const loadChunk = vi.fn().mockResolvedValue({ data: Buffer.from([0x89, 0x50]).toString('base64'), nextOffset: 2, eof: true })
    render(<AssetImage assetId="asset_1" mime="image/png" bytes={2} label="example" loadChunk={loadChunk} />)
    await waitFor(() => expect(screen.getByAltText('example')).toBeTruthy())
    expect(loadChunk).toHaveBeenCalledWith('asset_1', 0, 262144)
  })

  it('requires a preview before applying a rewind', async () => {
    const onPreview = vi.fn().mockResolvedValue(3)
    const onApply = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<RewindDialog open targetLabel="用户提问" busy={false} onPreview={onPreview} onApply={onApply} onClose={onClose} />)
    screen.getByText('预览影响').click()
    await waitFor(() => expect(screen.getByText('将移除 3 个条目。')).toBeTruthy())
    screen.getByText('应用回退').click()
    await waitFor(() => expect(onApply).toHaveBeenCalled())
  })
})
