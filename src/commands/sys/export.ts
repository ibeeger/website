import type { Process } from '../../core/process'

/** 变量名不叫 export，那是保留字。 */
export const exportCmd: Process = {
  name: 'export',
  description: '设置环境变量',
  usage: 'export 名称=值 [名称=值...]',
  async run(io, ctx) {
    const args = io.argv.slice(1)
    if (args.length === 0) { io.stderr.writeLine('用法: export 名称=值 [名称=值...]'); return 2 }

    // 之前只读 argv[1]：`export A=1 B=2` 会悄悄只设置 A、把 B 整个丢掉，
    // 还返回 0——静默的部分成功是最差的失败模式。这里消费全部操作数；
    // 某一个缺少等号不影响其余合法操作数生效，但整体退出码仍报 2，
    // 不能既处理了又装作全部成功。
    let code = 0
    for (const arg of args) {
      const eq = arg.indexOf('=')
      if (eq <= 0) {
        io.stderr.writeLine(`export: ${arg}: 需要 名称=值 的形式`)
        code = 2
        continue
      }
      ctx.env.set(arg.slice(0, eq), arg.slice(eq + 1))
    }
    return code
  },
}
