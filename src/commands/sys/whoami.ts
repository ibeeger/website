import type { Process } from '../../core/process'

export const whoami: Process = {
  name: 'whoami',
  description: '显示当前用户',
  usage: 'whoami',
  async run(io, ctx) {
    // 已登录时给完整身份；未登录仍然读 $USER，保持它作为真 shell 的行为
    const id = ctx.auth.identity()
    io.stdout.writeLine(id === null ? ctx.env.get('USER') ?? 'guest' : `${id.name} <${id.email}>`)
    return 0
  },
}
