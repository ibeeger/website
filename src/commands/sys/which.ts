import type { Process } from '../../core/process'

export const which: Process = {
  name: 'which',
  description: '查找命令位置',
  usage: 'which 命令',
  async run(io, ctx) {
    const name = io.argv[1]
    if (name === undefined) { io.stderr.writeLine('用法: which 命令'); return 2 }
    if (!ctx.registry.get(name)) { io.stderr.writeLine(`which: no ${name} in PATH`); return 1 }
    io.stdout.writeLine(`/usr/bin/${name}`)
    return 0
  },
}
