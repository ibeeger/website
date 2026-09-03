import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import type { Process } from '../../core/process'

export const touch: Process = {
  name: 'touch',
  description: '创建空文件或更新时间戳',
  usage: 'touch 文件...',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const targets = io.argv.slice(1)
    if (targets.length === 0) { io.stderr.writeLine('用法: touch 文件...'); return 2 }

    let code = 0
    for (const t of targets) {
      try {
        ctx.vfs.touch(ctx.vfs.resolve(ctx.cwd, t))
      } catch (e) {
        io.stderr.writeLine(formatError('touch', e))
        code = 1
      }
    }
    return code
  },
}
