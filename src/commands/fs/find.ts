import { completePath } from '../../core/complete'
import type { Inode } from '../../core/vfs/vfs'
import type { Process } from '../../core/process'

/** 把 glob 模式转成正则。与 expand.ts 中的规则保持一致。 */
function toRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

export const find: Process = {
  name: 'find',
  description: '递归查找文件',
  usage: 'find [起点] [-name 模式]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const args = io.argv.slice(1)
    const nameIdx = args.indexOf('-name')
    const pattern = nameIdx >= 0 ? args[nameIdx + 1] : undefined
    if (nameIdx >= 0 && pattern === undefined) {
      io.stderr.writeLine('find: -name 缺少参数')
      return 2
    }
    const start = (nameIdx === 0 ? undefined : args[0]) ?? '.'

    const abs = ctx.vfs.resolve(ctx.cwd, start)
    const st = ctx.vfs.stat(abs)
    if (!st) {
      io.stderr.writeLine(`find: '${start}': No such file or directory`)
      return 1
    }

    const re = pattern !== undefined ? toRegex(pattern) : null

    const walk = (inode: Inode, path: string) => {
      if (!re || re.test(inode.name)) io.stdout.writeLine(path)
      if (inode.kind !== 'dir') return
      for (const child of [...inode.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        walk(child, `${path}/${child.name}`)
      }
    }

    // 起点自身用用户给的名字表示；根节点名为 '/'，此时不做名字匹配
    if (!re || re.test(st.kind === 'dir' && start === '.' ? '.' : st.name)) {
      io.stdout.writeLine(start)
    }
    if (st.kind === 'dir') {
      for (const child of [...st.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        walk(child, `${start}/${child.name}`)
      }
    }
    return 0
  },
}
