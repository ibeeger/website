import type { Process } from '../../core/process'

export const date: Process = {
  name: 'date',
  description: '显示当前时间',
  usage: 'date',
  async run(io) {
    io.stdout.writeLine(new Date().toString())
    return 0
  },
}
