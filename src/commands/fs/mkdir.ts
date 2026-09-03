import { parseFlags } from '../lib'
import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import type { Process } from '../../core/process'

export const mkdir: Process = {
  name: 'mkdir',
  description: '创建目录',
  usage: 'mkdir [-p] 目录...',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx, { dirsOnly: true }) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['p'])
    if (bad) { io.stderr.writeLine(`mkdir: invalid option -- '${bad}'`); return 2 }
    if (operands.length === 0) { io.stderr.writeLine('用法: mkdir [-p] 目录...'); return 2 }

    let code = 0
    for (const t of operands) {
      try {
        ctx.vfs.mkdir(ctx.vfs.resolve(ctx.cwd, t), flags.has('p'))
      } catch (e) {
        io.stderr.writeLine(formatError('mkdir', e))
        code = 1
      }
    }
    return code
  },
}
