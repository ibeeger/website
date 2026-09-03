import type { Process } from '../../core/process'

export const history: Process = {
  name: 'history',
  description: '显示命令历史',
  usage: 'history',
  async run(io, ctx) {
    ctx.history.forEach((line, i) => {
      io.stdout.writeLine(`${String(i + 1).padStart(5)}  ${line}`)
    })
    return 0
  },
}
