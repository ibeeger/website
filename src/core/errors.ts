import { VfsError, type VfsErrorCode } from './vfs/vfs'

const MESSAGES: Record<VfsErrorCode, string> = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  ENOTEMPTY: 'Directory not empty',
  EEXIST: 'File exists',
  EPERM: 'Operation not permitted',
}

export function vfsMessage(code: VfsErrorCode): string {
  return MESSAGES[code]
}

/** 把任意异常格式化成一行 shell 风格的错误信息。 */
export function formatError(cmd: string, e: unknown): string {
  if (e instanceof VfsError) return `${cmd}: ${e.path}: ${vfsMessage(e.code)}`
  if (e instanceof Error) return `${cmd}: ${e.message}`
  return `${cmd}: ${String(e)}`
}
