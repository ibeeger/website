import type { Process } from '../../core/process'

export const clear: Process = {
  name: 'clear',
  description: '清空屏幕',
  usage: 'clear',
  async run(_io, ctx) {
    ctx.host.clear()
    return 0
  },
}
