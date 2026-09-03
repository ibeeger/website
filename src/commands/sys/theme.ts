import type { Process, Style } from '../../core/process'

const ACTIVE: Style = { color: 'green', bold: true }

export const theme: Process = {
  name: 'theme',
  description: '查看或切换配色主题',
  usage: 'theme [主题名]',
  complete(argv, ctx) {
    const frag = argv[argv.length - 1] ?? ''
    return ctx.host.listThemes().filter(t => t.startsWith(frag))
  },

  async run(io, ctx) {
    const available = ctx.host.listThemes()
    const wanted = io.argv[1]

    if (wanted === undefined) {
      const current = ctx.host.currentTheme()
      for (const t of available) {
        const isCurrent = t === current
        io.stdout.writeLine(`  ${isCurrent ? '*' : ' '} ${t}`, isCurrent ? ACTIVE : undefined)
      }
      return 0
    }

    if (!available.includes(wanted)) {
      io.stderr.writeLine(`theme: ${wanted}: 未知主题。可用：${available.join(', ')}`)
      return 1
    }

    ctx.host.setTheme(wanted)
    io.stdout.writeLine(`主题已切换为 ${wanted}`)
    return 0
  },
}
