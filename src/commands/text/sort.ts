import { parseFlags, readSources, splitLines } from '../lib'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const sort: Process = {
  name: 'sort',
  description: '按行排序',
  usage: 'sort [-r] [文件...]',

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['r'])
    if (bad) { io.stderr.writeLine(`sort: invalid option -- '${bad}'`); return 2 }

    const { parts, errors } = await readSources(io, ctx, operands)
    const lines = parts.flatMap(p => splitLines(p.text))

    lines.sort((a, b) => a.localeCompare(b))
    if (flags.has('r')) lines.reverse()
    io.stdout.writeText(lines.map(l => l + '\n').join(''))

    for (const e of errors) io.stderr.writeLine(`sort: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
