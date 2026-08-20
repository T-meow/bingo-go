import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { binaryCommand } from './binaryCommand'

export const DEFAULT_MAX_CLIENT_FRAME_BYTES = 1024 * 1024
export const DEFAULT_MAX_SERVER_FRAME_BYTES = 8 * 1024 * 1024
const WRITE_TIMEOUT_MS = 10_000

export type AppServerTransportFrame =
  | { kind: 'response'; id: unknown; result?: unknown; error?: { code: number; message: string; data?: unknown } }
  | { kind: 'notification'; method: string; params: Record<string, unknown> }

export type AppServerTransportExit = { exitCode: number | null; signal: string | null }

export type AppServerTransportHandlers = {
  onFrame(frame: AppServerTransportFrame): void
  onError(error: Error): void
  onExit(exit: AppServerTransportExit, stderr: string): void
}

export type AppServerTransportOptions = {
  maxClientFrameBytes?: number
  maxServerFrameBytes?: number
  timeoutMs?: number
}

export class AppServerTransport {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = Buffer.alloc(0)
  private stderr = ''
  private maxServerFrameBytes: number
  private maxClientFrameBytes: number
  private readonly timeoutMs: number
  private fatal = false

  constructor(
    private readonly binaryPath: string,
    private readonly cwd: string,
    private readonly handlers: AppServerTransportHandlers,
    private readonly env: NodeJS.ProcessEnv = process.env,
    options: AppServerTransportOptions = {}
  ) {
    this.maxServerFrameBytes = options.maxServerFrameBytes ?? DEFAULT_MAX_SERVER_FRAME_BYTES
    this.maxClientFrameBytes = options.maxClientFrameBytes ?? DEFAULT_MAX_CLIENT_FRAME_BYTES
    this.timeoutMs = options.timeoutMs ?? WRITE_TIMEOUT_MS
  }

  start(): void {
    if (this.child) throw new Error('AppServerTransport is already running')
    const launch = binaryCommand(this.binaryPath, ['app-server'])
    this.child = spawn(launch.command, launch.args, {
      cwd: this.cwd,
      env: this.env,
      shell: false,
      windowsVerbatimArguments: launch.windowsVerbatimArguments,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child.stdout.on('data', (chunk: Buffer) => this.consume(chunk))
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8')
    })
    this.child.on('error', (error) => {
      this.failPending(error)
      this.fatal = true
      this.handlers.onError(error)
      this.handlers.onExit({ exitCode: null, signal: null }, this.stderr)
    })
    this.child.on('exit', (code, signal) => {
      this.child = null
      this.failPending(new Error(`bingo app-server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`))
      this.handlers.onExit({ exitCode: code, signal }, this.stderr)
    })
  }

  setLimits(limits: { maxClientFrameBytes: number; maxServerFrameBytes: number }): void {
    this.maxClientFrameBytes = limits.maxClientFrameBytes
    this.maxServerFrameBytes = limits.maxServerFrameBytes
  }

  write(value: unknown): void {
    const child = this.child
    if (!child || child.stdin.destroyed || this.fatal) throw new Error('AppServerTransport is not writable')
    const line = `${JSON.stringify(value)}\n`
    const bytes = Buffer.byteLength(line, 'utf8')
    if (bytes > this.maxClientFrameBytes) {
      const error = new AppServerTransportError('FRAME_TOO_LARGE', `client frame exceeds the negotiated ${this.maxClientFrameBytes}-byte ceiling`)
      this.fatal = true
      this.failPending(error)
      child.kill()
      throw error
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const error = new AppServerTransportError('CLIENT_TOO_SLOW', `bingo did not accept a client frame within ${this.timeoutMs} ms`)
      this.fatal = true
      this.failPending(error)
      child.kill()
      this.handlers.onError(error)
    }, this.timeoutMs)
    child.stdin.write(line, (error) => {
      settled = true
      clearTimeout(timer)
      if (error) {
        this.fatal = true
        this.failPending(new AppServerTransportError('TRANSPORT_FAILED', `cannot write to bingo app-server: ${error.message}`))
      }
    })
  }

  end(): void {
    this.child?.stdin.end()
  }

  close(): void {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) return
    this.child.kill()
  }

  get running(): boolean {
    return this.child !== null && !this.fatal
  }

  get stderrText(): string {
    return this.stderr
  }

  private consume(chunk: Buffer): void {
    this.pending = Buffer.concat([this.pending, chunk])
    let newline = this.pending.indexOf(0x0a)
    while (newline >= 0) {
      const raw = this.pending.subarray(0, newline)
      this.pending = this.pending.subarray(newline + 1)
      if (raw.length > 0) this.consumeLine(raw)
      newline = this.pending.indexOf(0x0a)
    }
    if (this.pending.length > this.maxServerFrameBytes) {
      const error = new AppServerTransportError('FRAME_TOO_LARGE', `server frame exceeds the negotiated ${this.maxServerFrameBytes}-byte ceiling`)
      this.fatal = true
      this.failPending(error)
      this.child?.kill()
      this.handlers.onError(error)
    }
  }

  private consumeLine(raw: Buffer): void {
    if (raw.length > this.maxServerFrameBytes) {
      this.fail(new AppServerTransportError('FRAME_TOO_LARGE', `server frame exceeds the negotiated ${this.maxServerFrameBytes}-byte ceiling`))
      return
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(raw)
    } catch {
      this.fail(new AppServerTransportError('TRANSPORT_FAILED', 'bingo app-server emitted non-UTF-8 output'))
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      this.fail(new AppServerTransportError('TRANSPORT_FAILED', 'bingo app-server emitted malformed JSON'))
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      this.fail(new AppServerTransportError('TRANSPORT_FAILED', 'bingo app-server emitted a non-object frame'))
      return
    }
    const record = parsed as Record<string, unknown>
    if (record.jsonrpc !== '2.0') {
      this.fail(new AppServerTransportError('TRANSPORT_FAILED', 'bingo app-server emitted a frame without jsonrpc 2.0'))
      return
    }
    if (record.method === undefined && record.id === undefined) {
      this.fail(new AppServerTransportError('TRANSPORT_FAILED', 'bingo app-server emitted a frame without method or id'))
      return
    }
    if (record.method !== undefined) {
      if (typeof record.method !== 'string' || !isRecord(record.params)) {
        this.fail(new AppServerTransportError('TRANSPORT_FAILED', 'bingo app-server emitted an invalid notification'))
        return
      }
      this.handlers.onFrame({ kind: 'notification', method: record.method, params: record.params })
      return
    }
    if (isRpcError(record.error)) {
      this.handlers.onFrame({ kind: 'response', id: record.id, error: record.error })
      return
    }
    this.handlers.onFrame({ kind: 'response', id: record.id, result: record.result })
  }

  private fail(error: Error): void {
    this.fatal = true
    this.failPending(error)
    this.child?.kill()
    this.handlers.onError(error)
  }

  private failPending(error: Error): void {
    // The connection layer owns pending requests; it observes onError/onExit and
    // rejects them itself. Kept as a hook so future pending state never lives here.
    void error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRpcError(value: unknown): value is { code: number; message: string; data?: unknown } {
  return isRecord(value) && typeof value.code === 'number' && typeof value.message === 'string'
}

export class AppServerTransportError extends Error {
  constructor(
    readonly code: 'FRAME_TOO_LARGE' | 'TRANSPORT_FAILED' | 'CLIENT_TOO_SLOW',
    message: string
  ) {
    super(message)
    this.name = 'AppServerTransportError'
  }
}
