import type { Process, Style } from '../../core/process'

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
    if (name === undefined) { io.stderr.writeLine('用法: man 命令'); return 2 }

    const proc = ctx.registry.get(name)
    if (!proc) { io.stderr.writeLine(`No manual entry for ${name}`); return 1 }

    io.stdout.writeLine('名称', HEADING)
    io.stdout.writeLine(`    ${proc.name} —— ${proc.description}`)
    io.stdout.writeText('\n')
    io.stdout.writeLine('用法', HEADING)
    io.stdout.writeLine(`    ${proc.usage ?? proc.name}`)
    return 0
  },
}
