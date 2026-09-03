import type { Process } from '../../core/process'

export const pwd: Process = {
  name: 'pwd',
  description: '打印当前工作目录',
  usage: 'pwd',
  async run(io, ctx) {
    io.stdout.writeLine(ctx.cwd)
    return 0
  },
}
