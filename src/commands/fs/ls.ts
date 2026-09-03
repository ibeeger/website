import { parseFlags } from '../lib'
import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import type { Inode } from '../../core/vfs/vfs'
import type { Process, Style } from '../../core/process'

const DIR_STYLE: Style = { color: 'blue', bold: true }

/** 刻意一行一个条目，不做多列排版 —— 这样 `ls | wc -l` 才是正确的条目数。 */
export const ls: Process = {
  name: 'ls',
  description: '列出目录内容',
  usage: 'ls [-la] [路径...]',

  complete(argv, ctx) {
    return completePath(argv[argv.length - 1] ?? '', ctx)
  },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['l', 'a'])
    if (bad) { io.stderr.writeLine(`ls: invalid option -- '${bad}'`); return 2 }

    const targets = operands.length > 0 ? operands : ['.']
    const showHidden = flags.has('a')
    const longFormat = flags.has('l')
    let code = 0

    const emit = (inode: Inode, label: string) => {
      const style = inode.kind === 'dir' ? DIR_STYLE : undefined
      if (!longFormat) { io.stdout.writeLine(label, style); return }
      const mode = inode.kind === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'
      const size = inode.kind === 'file' ? inode.content.length : 4096
      const when = new Date(inode.mtime).toISOString().slice(0, 16).replace('T', ' ')
      io.stdout.writeText(`${mode}  guest  ${String(size).padStart(6)}  ${when}  `)
      io.stdout.writeLine(label, style)
    }

    for (const t of targets) {
      const abs = ctx.vfs.resolve(ctx.cwd, t)
      const st = ctx.vfs.stat(abs)
      if (!st) {
        io.stderr.writeLine(`ls: cannot access '${t}': No such file or directory`)
        code = 2
        continue
      }
      if (st.kind === 'file') { emit(st, t); continue }

      // 多目标时按 bash 惯例加上标题
      if (targets.length > 1) io.stdout.writeLine(`${t}:`)
      try {
        for (const entry of ctx.vfs.list(abs)) {
          if (!showHidden && entry.name.startsWith('.')) continue
          emit(entry, entry.name)
        }
      } catch (e) {
        io.stderr.writeLine(formatError('ls', e))
        code = 2
      }
      if (targets.length > 1) io.stdout.writeText('\n')
    }
    return code
  },
}
