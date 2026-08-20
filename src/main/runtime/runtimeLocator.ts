import { access, realpath, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { AppServerConnection } from './appServerConnection'
import type { GuiError, Result, RuntimeInfo } from '../../shared/contracts/ipc'
import { binaryCommand } from './binaryCommand'

const PROBE_TIMEOUT_MS = 10_000

type LocateOptions = {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  bundledBinary?: string
}

export class RuntimeLocator {
  constructor(private readonly options: LocateOptions = {}) {}

  async probe(workspacePath: string): Promise<Result<RuntimeInfo>> {
    const env = this.options.env ?? process.env
    const binary = await this.resolveBinary(env)
    if (!binary.ok) return binary

    const workspace = await this.resolveWorkspace(workspacePath)
    if (!workspace.ok) return workspace

    const protocol = await this.probeAppServer(binary.value, workspace.value, env)
    if (!protocol.ok) {
      return {
        ok: false,
        error: {
          ...protocol.error,
          msg: `${protocol.error.msg} Binary: ${binary.value}.`
        }
      }
    }

    return {
      ok: true,
      value: {
        binaryPath: binary.value,
        bingoVersion: protocol.value.bingoVersion,
        workspacePath: workspace.value,
        appServer: protocol.value.appServer
      }
    }
  }

  private async resolveBinary(env: NodeJS.ProcessEnv): Promise<Result<string>> {
    const override = env.BINGO_GUI_BINARY
    if (override) {
      if (!isAbsolute(override)) {
        return this.error('BINGO_NOT_FOUND', `BINGO_GUI_BINARY must be an absolute path: ${override}`)
      }
      return this.executablePath(override)
    }

    if (this.options.bundledBinary) return this.executablePath(this.options.bundledBinary)

    for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
      const names = process.platform === 'win32' ? ['bingo.exe', 'bingo.cmd', 'bingo'] : ['bingo']
      for (const name of names) {
        const candidate = join(directory, name)
        try {
          await access(candidate, constants.X_OK)
          return { ok: true, value: await realpath(candidate) }
        } catch {
          continue
        }
      }
    }

    return this.error('BINGO_NOT_FOUND', 'bingo was not found on PATH. Install bingo, update PATH, then retry.')
  }

  private async executablePath(path: string): Promise<Result<string>> {
    try {
      await access(path, constants.X_OK)
      return { ok: true, value: await realpath(path) }
    } catch {
      return this.error('BINGO_NOT_FOUND', `The configured bingo binary is missing or not executable: ${path}`)
    }
  }

  private async resolveWorkspace(path: string): Promise<Result<string>> {
    if (!isAbsolute(path)) return this.error('BAD_ARGUMENT', `Workspace path must be absolute: ${path}`)
    try {
      const resolved = await realpath(path)
      if (!(await stat(resolved)).isDirectory()) {
        return this.error('BAD_ARGUMENT', `Workspace path is not a directory: ${path}`)
      }
      return { ok: true, value: resolved }
    } catch {
      return this.error('BAD_ARGUMENT', `Workspace is unavailable: ${path}`)
    }
  }

  private async probeAppServer(binary: string, cwd: string, env: NodeJS.ProcessEnv): Promise<Result<{ bingoVersion: string; appServer: RuntimeInfo['appServer'] }>> {
    let stderr = ''
    const connection = new AppServerConnection(binary, cwd, {
      onNotification: () => undefined,
      onDesync: () => undefined,
      onExit: (_exit, stderrText) => { stderr = stderrText }
    }, env)
    let timeoutHandle: NodeJS.Timeout | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('bingo did not complete the app-server initialize handshake within 10 seconds')), this.options.timeoutMs ?? PROBE_TIMEOUT_MS)
      })
      const initialized = await Promise.race([connection.start(), timeout])
      if (timeoutHandle) clearTimeout(timeoutHandle)
      await connection.shutdown()
      return {
        ok: true,
        value: {
          bingoVersion: initialized.server.version,
          appServer: {
            protocol: initialized.protocol,
            capabilities: initialized.capabilities,
            limits: initialized.limits
          }
        }
      }
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      await connection.close().catch(() => undefined)
      const detail = [error instanceof Error ? error.message : String(error), stderr.trim()].filter(Boolean).join('; ')
      return this.error('BINGO_PROTOCOL_UNSUPPORTED', `This bingo version does not support the GUI app-server. ${detail}`)
    }
  }

  private error<T>(code: string, msg: string): Result<T> {
    return { ok: false, error: { code, msg, level: 'flow', recoverable: true, action: 'retry' } }
  }
}
