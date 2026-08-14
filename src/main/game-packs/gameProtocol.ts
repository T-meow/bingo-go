import { lstat, readFile, realpath } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { protocol, type Session } from 'electron'
import { GAME_PACK_LIMITS, gamePackRelativePathSchema, type GamePackManifestV1 } from '../../shared/contracts/gamePacks'

export const GAME_PROTOCOL_SCHEME = 'bingo-game'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "img-src 'self'",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "form-action 'none'"
].join('; ')

export function registerGameProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: GAME_PROTOCOL_SCHEME,
    privileges: { standard: true, secure: true, stream: true }
  }])
}

export class GameProtocol {
  async register(gameSession: Session, manifest: GamePackManifestV1, root: string): Promise<void> {
    if (gameSession.protocol.isProtocolHandled(GAME_PROTOCOL_SCHEME)) gameSession.protocol.unhandle(GAME_PROTOCOL_SCHEME)
    const rootRealPath = await realpath(root)
    gameSession.protocol.handle(GAME_PROTOCOL_SCHEME, async (request) => {
      try {
        if (request.method !== 'GET' && request.method !== 'HEAD') return response(405, 'Method not allowed')
        const url = new URL(request.url)
        if (url.protocol !== `${GAME_PROTOCOL_SCHEME}:` || url.hostname !== manifest.id || url.username || url.password || url.port) return response(403, 'Forbidden')
        let packagePath: string
        try { packagePath = decodeURIComponent(url.pathname.replace(/^\/+/, '')) } catch { return response(400, 'Bad request') }
        if (!gamePackRelativePathSchema.safeParse(packagePath).success) return response(400, 'Bad request')
        const absolute = resolve(rootRealPath, ...packagePath.split('/'))
        if (absolute !== rootRealPath && !absolute.startsWith(`${rootRealPath}${sep}`)) return response(403, 'Forbidden')
        const [details, actual] = await Promise.all([lstat(absolute), realpath(absolute)])
        if (!details.isFile() || details.isSymbolicLink() || details.size > GAME_PACK_LIMITS.fileBytes || (actual !== rootRealPath && !actual.startsWith(`${rootRealPath}${sep}`))) return response(404, 'Not found')
        const bytes = request.method === 'HEAD' ? null : await readFile(actual)
        return new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': mimeType(absolute),
            'Content-Security-Policy': CONTENT_SECURITY_POLICY,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'Referrer-Policy': 'no-referrer'
          }
        })
      } catch (error) {
        return response(isNotFound(error) ? 404 : 500, isNotFound(error) ? 'Not found' : 'Package read failed')
      }
    })
  }
}

function response(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.js': case '.mjs': return 'text/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.png': return 'image/png'
    case '.webp': return 'image/webp'
    case '.jpg': case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.svg': return 'image/svg+xml'
    case '.woff': return 'font/woff'
    case '.woff2': return 'font/woff2'
    case '.mp3': return 'audio/mpeg'
    case '.ogg': return 'audio/ogg'
    case '.wav': return 'audio/wav'
    case '.mp4': return 'video/mp4'
    case '.webm': return 'video/webm'
    default: return 'application/octet-stream'
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
