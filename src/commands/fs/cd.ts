import { completePath } from '../../core/complete'
import type { Process } from '../../core/process'

export const cd: Process = {
  name: 'cd',
  description: '切换目录',
  usage: 'cd [目录]    cd -  返回上一个目录',

  complete(argv, ctx) {
    return completePath(argv[argv.length - 1] ?? '', ctx, { dirsOnly: true })
  },

  async run(io, ctx) {
    const home = ctx.env.get('HOME') ?? '/'
    const arg = io.argv[1]

    let target: string
    if (arg === undefined) target = home
    else if (arg === '-') {
      const prev = ctx.env.get('OLDPWD')
      if (!prev) { io.stderr.writeLine('cd: OLDPWD not set'); return 1 }
      target = prev
      io.stdout.writeLine(prev)      // 与 bash 一致：cd - 会回显目标
    } else target = arg

    const abs = ctx.vfs.resolve(ctx.cwd, target)
    const st = ctx.vfs.stat(abs)
    if (!st) { io.stderr.writeLine(`cd: ${target}: No such file or directory`); return 1 }
    if (st.kind !== 'dir') { io.stderr.writeLine(`cd: ${target}: Not a directory`); return 1 }

    ctx.env.set('OLDPWD', ctx.cwd)
    ctx.cwd = abs                     // setter 会同步 PWD
    return 0
  },
}
