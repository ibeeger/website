import type { Process } from '../../core/process'

export const whoami: Process = {
  name: 'whoami',
  description: '显示当前用户',
  usage: 'whoami',
  async run(io, ctx) {
    io.stdout.writeLine(ctx.env.get('USER') ?? 'guest')
    return 0
  },
}
