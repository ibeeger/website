import { createVfs, emptyDir, type VFS } from './vfs'
import { dirname } from './path'

/** 由「绝对路径 → 文件内容」的映射构建初始文件树，中间目录自动创建。 */
export function buildInitialVfs(
  files: Record<string, string>,
  now: () => number = Date.now,
): VFS {
  const vfs = createVfs(emptyDir('/', now()), now)
  for (const [path, content] of Object.entries(files)) {
    const dir = dirname(path)
    if (dir !== '/') vfs.mkdir(dir, true)
    vfs.writeFile(path, content)
  }
  return vfs
}
