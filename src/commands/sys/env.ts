import type { Process } from '../../core/process'

export const env: Process = {
  name: 'env',
  description: '列出环境变量',
  usage: 'env',
  async run(io, ctx) {
    for (const [k, v] of Object.entries(ctx.env.all()).sort(([a], [b]) => a.localeCompare(b))) {
      io.stdout.writeLine(`${k}=${v}`)
    }
    return 0
  },
}
