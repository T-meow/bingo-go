import { access, realpath } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { cliEventSchema } from '../../shared/contracts/cli'
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

    const protocol = await this.probeProtocol(binary.value, workspace.value, env)
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
        protocolVersion: 1,
        workspacePath: workspace.value,
        capabilities: protocol.value.capabilities
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
      return { ok: true, value: await realpath(path) }
    } catch {
      return this.error('BAD_ARGUMENT', `Workspace is unavailable: ${path}`)
    }
  }

  private probeProtocol(binary: string, cwd: string, env: NodeJS.ProcessEnv): Promise<Result<{ bingoVersion: string; capabilities: string[] }>> {
    return new Promise((resolve) => {
      const args = ['--json-events', '--probe']
      const launch = binaryCommand(binary, args)
      const child = spawn(launch.command, launch.args, { cwd, env, windowsVerbatimArguments: launch.windowsVerbatimArguments, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let settled = false
      let timer: NodeJS.Timeout
      let protocol: { bingoVersion: string; capabilities: string[] } | null = null

      const finish = (result: Result<{ bingoVersion: string; capabilities: string[] }>): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (!child.killed && child.exitCode === null) child.kill()
        resolve(result)
      }

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        const lines = stdout.split('\n').filter(Boolean)
        if (lines.length > 1) {
          finish(this.error('BINGO_PROTOCOL_UNSUPPORTED', 'bingo probe emitted more than one event. Install a compatible bingo build, then retry.'))
        }
      })
      child.on('error', () => finish(this.error('BINGO_PROBE_FAILED', 'Could not start bingo. Check the binary and retry.')))
      child.on('exit', (code) => {
        if (settled) return
        const lines = stdout.split('\n').filter(Boolean)
        if (code !== 0 || lines.length !== 1) {
          finish(this.error('BINGO_PROTOCOL_UNSUPPORTED', 'This bingo version does not support GUI protocol v1. Install a compatible bingo build, then retry.'))
          return
        }
        try {
          const event = cliEventSchema.parse(JSON.parse(lines[0]))
          if (event.type === 'protocol.ready') {
            const bingoVersion = event.metadata?.bingoVersion ?? event.bingoVersion
            if (bingoVersion) protocol = { bingoVersion, capabilities: event.metadata?.capabilities ?? event.capabilities ?? [] }
          }
        } catch {
          protocol = null
        }
        finish(protocol
          ? { ok: true, value: protocol }
          : this.error('BINGO_PROTOCOL_UNSUPPORTED', 'This bingo version does not support GUI protocol v1. Install a compatible bingo build, then retry.'))
      })

      timer = setTimeout(
        () => finish(this.error('BINGO_PROBE_TIMEOUT', 'bingo did not respond within 10 seconds. Check the binary and retry.')),
        this.options.timeoutMs ?? PROBE_TIMEOUT_MS
      )
    })
  }

  private error<T>(code: string, msg: string): Result<T> {
    return { ok: false, error: { code, msg, level: 'flow', recoverable: true, action: 'retry' } }
  }
}
