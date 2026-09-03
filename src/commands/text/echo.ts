import type { Process } from '../../core/process'

export const echo: Process = {
  name: 'echo',
  description: '输出参数',
  usage: 'echo [-n] [文本...]',

  async run(io) {
    const noNewline = io.argv[1] === '-n'
    const words = io.argv.slice(noNewline ? 2 : 1)
    io.stdout.writeText(words.join(' ') + (noNewline ? '' : '\n'))
    return 0
  },
}
