import type { Process, Style } from '../../core/process'

const NAME_STYLE: Style = { color: 'green', bold: true }

export const help: Process = {
  name: 'help',
  description: '列出可用命令',
  usage: 'help',

  async run(io, ctx) {
    const cmds = ctx.registry.list().filter(p => !p.hidden)
    const width = Math.max(...cmds.map(c => c.name.length), 0)

    io.stdout.writeLine('可用命令：')
    io.stdout.writeText('\n')
    for (const c of cmds) {
      io.stdout.writeText('  ')
      io.stdout.writeText(c.name.padEnd(width), NAME_STYLE)
      io.stdout.writeLine('  ' + c.description)
    }
    io.stdout.writeText('\n')
    io.stdout.writeLine("输入 `man <命令>` 查看用法，Tab 键补全，↑↓ 翻历史。", { dim: true })
    return 0
  },
}
