export type BinaryCommand = {
  command: string
  args: string[]
  windowsVerbatimArguments?: boolean
}

export function binaryCommand(binaryPath: string, args: string[], platform: NodeJS.Platform = process.platform, comspec = process.env.ComSpec): BinaryCommand {
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(binaryPath)) {
    const command = comspec || 'cmd.exe'
    return { command, args: ['/d', '/s', '/c', quoteCmdCommand(binaryPath, args)], windowsVerbatimArguments: true }
  }
  return /\.(?:mjs|cjs|js)$/i.test(binaryPath)
    ? { command: process.execPath, args: [binaryPath, ...args] }
    : { command: binaryPath, args }
}

function quoteCmdCommand(command: string, args: string[]): string {
  return `"${[command, ...args].map(quoteCmdArg).join(' ')}"`
}

function quoteCmdArg(value: string): string {
  if (!value) return '""'
  if (!/[\s&|<>^()%!\"]/.test(value)) return value
  return `"${value.replace(/([\^&|<>])/g, '^$1').replace(/"/g, '""')}"`
}
