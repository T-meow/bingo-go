import type { AssetRecord } from '../../shared/contracts/appServer'
import type { AppServerSessionManager } from './appServerSessionManager'

const DEFAULT_CHUNK_BYTES = 256 * 1024
const MAX_INLINE_ASSET_BYTES = 32 * 1024 * 1024

export class AppServerAssetService {
  constructor(
    private readonly manager: AppServerSessionManager,
    private readonly chunkBytes = DEFAULT_CHUNK_BYTES
  ) {}

  async registerPath(path: string, expectedMime?: string, expectedSha256?: string): Promise<AssetRecord> {
    const result = await this.manager.assetRegisterPath({ path, expectedMime: expectedMime ?? null, expectedSha256: expectedSha256 ?? null })
    return result.asset
  }

  async readDataUrl(assetId: string, mime = 'application/octet-stream'): Promise<string> {
    const chunks: string[] = []
    let offset = 0
    let total = 0
    for (;;) {
      const result = await this.manager.assetReadChunk({ assetId, offset, length: this.chunkBytes })
      chunks.push(result.data)
      total += result.data.length
      if (total > MAX_INLINE_ASSET_BYTES) throw new Error(`asset ${assetId} exceeds the ${MAX_INLINE_ASSET_BYTES}-byte inline limit`)
      if (result.eof) break
      offset = result.nextOffset
    }
    return `data:${mime};base64,${chunks.join('')}`
  }

  async readText(assetId: string): Promise<string> {
    const chunks: Buffer[] = []
    let offset = 0
    let total = 0
    for (;;) {
      const result = await this.manager.assetReadChunk({ assetId, offset, length: this.chunkBytes })
      chunks.push(Buffer.from(result.data, 'base64'))
      total += chunks.at(-1)?.length ?? 0
      if (total > MAX_INLINE_ASSET_BYTES) throw new Error(`asset ${assetId} exceeds the ${MAX_INLINE_ASSET_BYTES}-byte inline limit`)
      if (result.eof) break
      offset = result.nextOffset
    }
    return Buffer.concat(chunks).toString('utf8')
  }
}
