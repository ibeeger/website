import type { Process, Style } from '../../core/process'
import { commandText } from '../../i18n/commandMeta'

const NAME_STYLE: Style = { color: 'green', bold: true }

export const help: Process = {
  name: 'help',
  description: '列出可用命令',
  usage: 'help',

  async run(io, ctx) {
    const lang = ctx.host.currentLang()
    const cmds = ctx.registry.list().filter(p => !p.hidden)
    const width = Math.max(...cmds.map(c => c.name.length), 0)

    io.stdout.writeLine(lang === 'zh' ? '可用命令：' : 'Available commands:')
    io.stdout.writeText('\n')
    for (const c of cmds) {
      io.stdout.writeText('  ')
      io.stdout.writeText(c.name.padEnd(width), NAME_STYLE)
      // 查不到就用命令自带的描述 —— 新命令不写翻译也能工作
      io.stdout.writeLine('  ' + (commandText(c.name, lang).description ?? c.description))
    }
    io.stdout.writeText('\n')
    io.stdout.writeLine(
      lang === 'zh'
        ? '输入 `man <命令>` 查看用法，Tab 键补全，↑↓ 翻历史。'
        : 'Type `man <command>` for usage. Tab completes, ↑↓ walks history.',
      { dim: true },
    )
    return 0
  },
}
