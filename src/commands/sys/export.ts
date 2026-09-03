import type { Process } from '../../core/process'

/** 变量名不叫 export，那是保留字。 */
export const exportCmd: Process = {
  name: 'export',
  description: '设置环境变量',
  usage: 'export 名称=值',
  async run(io, ctx) {
    const arg = io.argv[1]
    if (arg === undefined) { io.stderr.writeLine('用法: export 名称=值'); return 2 }

    const eq = arg.indexOf('=')
    if (eq <= 0) { io.stderr.writeLine(`export: ${arg}: 需要 名称=值 的形式`); return 2 }

    ctx.env.set(arg.slice(0, eq), arg.slice(eq + 1))
    return 0
  },
}
