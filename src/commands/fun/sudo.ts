import type { Process } from '../../core/process'

export const sudo: Process = {
  name: 'sudo',
  description: '以超级用户身份执行',
  usage: 'sudo 命令',
  hidden: true,

  async run(io, ctx) {
    const user = ctx.env.get('USER') ?? 'guest'
    io.stderr.writeLine(`[sudo] password for ${user}: `)
    io.stderr.writeLine(`${user} is not in the sudoers file. This incident will be reported.`)
    return 1
  },
}
