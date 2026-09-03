import type { Process } from '../../core/process'

export const uname: Process = {
  name: 'uname',
  description: '显示系统信息',
  usage: 'uname [-a]',
  async run(io, ctx) {
    if (io.argv.includes('-a')) {
      const host = ctx.env.get('HOSTNAME') ?? 'terminal'
      io.stdout.writeLine(`Linux ${host} 6.6.0-web #1 SMP PREEMPT_DYNAMIC wasm32 GNU/Linux`)
    } else {
      io.stdout.writeLine('Linux')
    }
    return 0
  },
}
