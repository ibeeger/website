import type { Process, Style } from '../../core/process'
import { commandText } from '../../i18n/commandMeta'

const HEADING: Style = { bold: true }

export const man: Process = {
  name: 'man',
  description: '查看命令用法',
  usage: 'man 命令',
  complete(argv, ctx) {
    const frag = argv[argv.length - 1] ?? ''
    return ctx.registry.list().filter(p => !p.hidden && p.name.startsWith(frag)).map(p => p.name)
  },

  async run(io, ctx) {
    const name = io.argv[1]
    if (name === undefined) {
      io.stderr.writeLine(ctx.host.currentLang() === 'zh' ? '用法: man 命令' : 'Usage: man command')
      return 2
    }

    const proc = ctx.registry.get(name)
    if (!proc) { io.stderr.writeLine(`No manual entry for ${name}`); return 1 }

    const lang = ctx.host.currentLang()
    const t = commandText(proc.name, lang)
    const description = t.description ?? proc.description
    const usage = t.usage ?? proc.usage ?? proc.name

    io.stdout.writeLine(lang === 'zh' ? '名称' : 'NAME', HEADING)
    io.stdout.writeLine(`    ${proc.name} —— ${description}`)
    io.stdout.writeText('\n')
    io.stdout.writeLine(lang === 'zh' ? '用法' : 'USAGE', HEADING)
    // usage 可能是多行字符串（子命令各占一行）；按单行写会把后续行的
    // 缩进和终端左边界拼在一起，视觉上从第一行的悬挂缩进里掉出去。
    for (const line of usage.split('\n')) {
      io.stdout.writeLine(`    ${line}`)
    }
    return 0
  },
}
