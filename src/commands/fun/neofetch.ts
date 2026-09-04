import type { Process, Style } from '../../core/process'

const LOGO = [
  '        .--.     ',
  '       |o_o |    ',
  '       |:_/ |    ',
  '      //   \\ \\   ',
  '     (|     | )  ',
  "    /'\\_   _/`\\  ",
  '    \\___)=(___/  ',
]

const ACCENT: Style = { color: 'cyan', bold: true }
const LABEL: Style = { color: 'blue', bold: true }

export const neofetch: Process = {
  name: 'neofetch',
  description: '显示系统信息',
  usage: 'neofetch',
  hidden: true,

  async run(io, ctx) {
    const user = ctx.env.get('USER') ?? 'guest'
    const host = ctx.env.get('HOSTNAME') ?? 'terminal'
    const info: [string, string][] = [
      [`${user}@${host}`, ''],
      ['OS', 'BrowserLinux x86_64 (WebAssembly ready)'],
      ['Kernel', '6.6.0-web'],
      ['Shell', ctx.env.get('SHELL') ?? '/bin/bash'],
      ['Terminal', 'terminal-site'],
      ['Theme', ctx.host.currentTheme()],
      ['Commands', String(ctx.registry.list().filter(p => !p.hidden).length)],
    ]

    const rows = Math.max(LOGO.length, info.length)
    for (let i = 0; i < rows; i++) {
      io.stdout.writeText((LOGO[i] ?? ' '.repeat(17)) + '  ', ACCENT)
      const entry = info[i]
      if (!entry) { io.stdout.writeText('\n'); continue }
      const [label, value] = entry
      if (value === '') io.stdout.writeLine(label, ACCENT)
      else { io.stdout.writeText(label + ': ', LABEL); io.stdout.writeLine(value) }
    }
    return 0
  },
}
