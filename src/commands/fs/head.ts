import { readSources } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

/** 解析 `-n N`，返回 null 表示参数非法。 */
export function takeCount(argv: string[], fallback: number): { count: number | null; rest: string[] } {
  const rest: string[] = []
  let count = fallback
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '-n') {
      const raw = argv[i + 1]
      const n = Number(raw)
      if (raw === undefined || !Number.isInteger(n) || n < 0) return { count: null, rest }
      count = n
      i++
      continue
    }
    rest.push(argv[i]!)
  }
  return { count, rest }
}

export const head: Process = {
  name: 'head',
  description: '输出文件开头若干行',
  usage: 'head [-n 行数] [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { count, rest } = takeCount(io.argv, 10)
    if (count === null) { io.stderr.writeLine('head: invalid number of lines'); return 2 }
    const { parts, errors } = await readSources(io, ctx, rest)
    for (const p of parts) {
      const lines = p.text.split('\n')
      const hasTrailing = lines[lines.length - 1] === ''
      if (hasTrailing) lines.pop()
      io.stdout.writeText(lines.slice(0, count).map(l => l + '\n').join(''))
    }
    for (const e of errors) io.stderr.writeLine(`head: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
