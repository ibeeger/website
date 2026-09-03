import { completePath } from '../../core/complete'
import type { DirInode } from '../../core/vfs/vfs'
import type { Process, Style, Writer } from '../../core/process'

const DIR_STYLE: Style = { color: 'blue', bold: true }

export const tree: Process = {
  name: 'tree',
  description: '以树状结构显示目录',
  usage: 'tree [目录]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx, { dirsOnly: true }) },

  async run(io, ctx) {
    const target = io.argv[1] ?? '.'
    const abs = ctx.vfs.resolve(ctx.cwd, target)
    const st = ctx.vfs.stat(abs)
    if (!st) { io.stderr.writeLine(`tree: ${target}: No such file or directory`); return 1 }
    if (st.kind !== 'dir') { io.stderr.writeLine(`tree: ${target}: Not a directory`); return 1 }

    let dirs = 0
    let files = 0

    const walk = (dir: DirInode, prefix: string, out: Writer) => {
      const entries = [...dir.children.values()]
        .filter(e => !e.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name))

      entries.forEach((entry, i) => {
        const last = i === entries.length - 1
        out.writeText(prefix + (last ? '└── ' : '├── '))
        out.writeLine(entry.name, entry.kind === 'dir' ? DIR_STYLE : undefined)
        if (entry.kind === 'dir') {
          dirs++
          walk(entry, prefix + (last ? '    ' : '│   '), out)
        } else files++
      })
    }

    io.stdout.writeLine(target)
    walk(st, '', io.stdout)
    io.stdout.writeText('\n')
    io.stdout.writeLine(
      `${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`,
    )
    return 0
  },
}
