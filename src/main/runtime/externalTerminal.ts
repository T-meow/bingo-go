import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import type { ExternalTerminalOpened } from '../../shared/contracts/ipc'

export type ExternalTerminalErrorCode = 'WORKSPACE_UNAVAILABLE' | 'TERMINAL_UNAVAILABLE' | 'PLATFORM_UNSUPPORTED'

export class ExternalTerminalError extends Error {
  constructor(readonly code: ExternalTerminalErrorCode, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'ExternalTerminalError'
  }
}

type LaunchOptions = {
  cwd: string
  detached: true
  stdio: 'ignore'
  windowsHide: boolean
}

type SpawnedProcess = {
  once(event: 'spawn', listener: () => void): SpawnedProcess
  once(event: 'error', listener: (error: Error) => void): SpawnedProcess
  unref(): void
}

type TerminalCandidate = {
  name: string
  executable: string
  args: string[]
  windowsHide?: boolean
}

export type ExternalTerminalDependencies = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  directoryExists(path: string): Promise<boolean>
  spawnProcess(executable: string, args: string[], options: LaunchOptions): SpawnedProcess
}

const defaultDependencies: ExternalTerminalDependencies = {
  platform: process.platform,
  env: process.env,
  directoryExists: async (path) => (await stat(path)).isDirectory(),
  spawnProcess: (executable, args, options) => spawn(executable, args, { ...options, shell: false }) as SpawnedProcess
}

export async function openExternalTerminal(
  workspacePath: string,
  dependencies: ExternalTerminalDependencies = defaultDependencies
): Promise<ExternalTerminalOpened> {
  let available = false
  try {
    available = await dependencies.directoryExists(workspacePath)
  } catch {
    // A deleted or inaccessible workspace is reported through the same stable error.
  }
  if (!available) {
    throw new ExternalTerminalError('WORKSPACE_UNAVAILABLE', `当前工作区不可访问：${workspacePath}`)
  }

  const candidates = terminalCandidates(dependencies.platform, dependencies.env, workspacePath)
  if (!candidates.length) {
    throw new ExternalTerminalError('PLATFORM_UNSUPPORTED', `当前平台暂不支持打开外部终端：${dependencies.platform}`)
  }

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      await launchCandidate(candidate, workspacePath, dependencies.spawnProcess)
      return { terminalName: candidate.name, workspacePath }
    } catch (error) {
      lastError = error
    }
  }

  throw new ExternalTerminalError(
    'TERMINAL_UNAVAILABLE',
    dependencies.platform === 'linux'
      ? '未找到可用的外部终端。请安装终端模拟器或配置 TERMINAL 环境变量。'
      : '无法启动系统终端，请检查终端应用是否可用。',
    lastError
  )
}

function terminalCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, workspacePath: string): TerminalCandidate[] {
  if (platform === 'win32') {
    return [
      { name: 'Windows Terminal', executable: 'wt.exe', args: ['-w', '-1', '-d', workspacePath] },
      {
        name: 'Windows PowerShell',
        executable: 'powershell.exe',
        args: ['-NoLogo']
      }
    ]
  }
  if (platform === 'darwin') {
    return [{ name: 'Terminal', executable: '/usr/bin/open', args: ['-a', 'Terminal', workspacePath] }]
  }
  if (platform !== 'linux') return []

  const configured = env.TERMINAL?.trim()
  return uniqueCandidates([
    { name: '默认终端', executable: 'xdg-terminal-exec', args: [] },
    ...(configured && !configured.includes('\0') ? [{ name: configured, executable: configured, args: [] }] : []),
    { name: '系统终端', executable: 'x-terminal-emulator', args: [] },
    { name: 'GNOME Terminal', executable: 'gnome-terminal', args: [`--working-directory=${workspacePath}`] },
    { name: 'GNOME Console', executable: 'kgx', args: [`--working-directory=${workspacePath}`] },
    { name: 'Konsole', executable: 'konsole', args: ['--workdir', workspacePath] },
    { name: 'Xfce Terminal', executable: 'xfce4-terminal', args: [`--working-directory=${workspacePath}`] },
    { name: 'MATE Terminal', executable: 'mate-terminal', args: [`--working-directory=${workspacePath}`] },
    { name: 'Kitty', executable: 'kitty', args: ['--directory', workspacePath] },
    { name: 'Alacritty', executable: 'alacritty', args: ['--working-directory', workspacePath] },
    { name: 'WezTerm', executable: 'wezterm', args: ['start', '--cwd', workspacePath] },
    { name: 'xterm', executable: 'xterm', args: [] }
  ])
}

function uniqueCandidates(candidates: TerminalCandidate[]): TerminalCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(({ executable }) => {
    if (seen.has(executable)) return false
    seen.add(executable)
    return true
  })
}

function launchCandidate(
  candidate: TerminalCandidate,
  workspacePath: string,
  spawnProcess: ExternalTerminalDependencies['spawnProcess']
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(candidate.executable, candidate.args, {
      cwd: workspacePath,
      detached: true,
      stdio: 'ignore',
      windowsHide: candidate.windowsHide ?? false
    })
    let settled = false
    child.once('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve()
    })
  })
}
