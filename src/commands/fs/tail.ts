import { readSources } from '../lib'
import { takeCount } from './head'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const tail: Process = {
  name: 'tail',
  description: '输出文件末尾若干行',
  usage: 'tail [-n 行数] [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { count, rest } = takeCount(io.argv, 10)
    if (count === null) { io.stderr.writeLine('tail: invalid number of lines'); return 2 }
    const { parts, errors } = await readSources(io, ctx, rest)
    for (const p of parts) {
      const lines = p.text.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      io.stdout.writeText(lines.slice(-count).map(l => l + '\n').join(''))
    }
    for (const e of errors) io.stderr.writeLine(`tail: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
