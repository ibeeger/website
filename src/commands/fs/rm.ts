import { parseFlags } from '../lib'
import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import { VfsError } from '../../core/vfs/vfs'
import type { Process } from '../../core/process'

export const rm: Process = {
  name: 'rm',
  description: '删除文件或目录',
  usage: 'rm [-rf] 路径...',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['r', 'f'])
    if (bad) { io.stderr.writeLine(`rm: invalid option -- '${bad}'`); return 2 }

    const force = flags.has('f')
    if (operands.length === 0) {
      if (force) return 0
      io.stderr.writeLine('用法: rm [-rf] 路径...')
      return 2
    }

    let code = 0
    for (const t of operands) {
      const abs = ctx.vfs.resolve(ctx.cwd, t)
      const st = ctx.vfs.stat(abs)

      if (!st) {
        if (force) continue
        io.stderr.writeLine(`rm: ${t}: No such file or directory`)
        code = 1
        continue
      }
      if (st.kind === 'dir' && !flags.has('r')) {
        io.stderr.writeLine(`rm: ${t}: Is a directory`)
        code = 1
        continue
      }
      try {
        ctx.vfs.remove(abs, flags.has('r'))
      } catch (e) {
        // 根目录的 EPERM 即使加了 -f 也要报出来
        if (e instanceof VfsError && e.code === 'EPERM') {
          io.stderr.writeLine(formatError('rm', e))
          code = 1
          continue
        }
        if (force) continue
        io.stderr.writeLine(formatError('rm', e))
        code = 1
      }
    }
    return code
  },
}
