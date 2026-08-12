import { join } from 'node:path'

export function bundledBingoPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  const binaryName = platform === 'win32' ? 'bingo.exe' : 'bingo'
  return join(resourcesPath, 'bin', `${platform}-${arch}`, binaryName)
}
