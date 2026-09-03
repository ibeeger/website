import { parseFlags, readSources, splitLines } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const wc: Process = {
  name: 'wc',
  description: '统计行数、词数与字节数',
  usage: 'wc [-lwc] [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['l', 'w', 'c'])
    if (bad) { io.stderr.writeLine(`wc: invalid option -- '${bad}'`); return 2 }

    const showAll = flags.size === 0
    const { parts, errors } = await readSources(io, ctx, operands)

    for (const p of parts) {
      const lines = splitLines(p.text).length
      const words = p.text.trim() === '' ? 0 : p.text.trim().split(/\s+/).length
      // 必须按 UTF-8 字节数计，不能用 .length —— 本站内容是中文，
      // 后者数的是 UTF-16 码元，会把真实字节数少报约三分之二。
      const bytes = new TextEncoder().encode(p.text).length

      const cols: number[] = []
      if (showAll || flags.has('l')) cols.push(lines)
      if (showAll || flags.has('w')) cols.push(words)
      if (showAll || flags.has('c')) cols.push(bytes)

      const label = p.name === '-' ? '' : ` ${p.name}`
      io.stdout.writeLine(cols.join(' ') + label)
    }
    for (const e of errors) io.stderr.writeLine(`wc: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
