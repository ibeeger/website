import { parseFlags, readSources, splitLines } from '../lib'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const uniq: Process = {
  name: 'uniq',
  description: '折叠相邻的重复行',
  usage: 'uniq [-c] [文件...]',

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['c'])
    if (bad) { io.stderr.writeLine(`uniq: invalid option -- '${bad}'`); return 2 }

    const { parts, errors } = await readSources(io, ctx, operands)
    const lines = parts.flatMap(p => splitLines(p.text))

    let prev: string | null = null
    let count = 0
    const flush = () => {
      if (prev === null) return
      io.stdout.writeLine(flags.has('c') ? `${String(count).padStart(7)} ${prev}` : prev)
    }
    for (const l of lines) {
      if (l === prev) { count++; continue }
      flush()
      prev = l
      count = 1
    }
    flush()

    for (const e of errors) io.stderr.writeLine(`uniq: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
