import type { Process } from '../../core/process'

export const exit: Process = {
  name: 'exit',
  description: '退出终端',
  usage: 'exit',
  hidden: true,

  async run(io) {
    io.stdout.writeLine('这里没有出口。关掉标签页就行 —— 不过既然来了，试试 `help`？')
    return 0
  },
}
