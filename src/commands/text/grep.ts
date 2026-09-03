import { parseFlags, readSources, splitLines } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const grep: Process = {
  name: 'grep',
  description: '按正则筛选行',
  usage: 'grep [-inv] 模式 [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['i', 'n', 'v'])
    if (bad) { io.stderr.writeLine(`grep: invalid option -- '${bad}'`); return 2 }

    const pattern = operands[0]
    if (pattern === undefined) { io.stderr.writeLine('用法: grep [-inv] 模式 [文件...]'); return 2 }

    let re: RegExp
    try {
      re = new RegExp(pattern, flags.has('i') ? 'i' : '')
    } catch {
      io.stderr.writeLine(`grep: invalid regular expression: ${pattern}`)
      return 2
    }

    const invert = flags.has('v')
    const withNumber = flags.has('n')
    const { parts, errors } = await readSources(io, ctx, operands.slice(1))

    let matched = false
    const multi = parts.filter(p => p.name !== '-').length > 1

    for (const p of parts) {
      const lines = splitLines(p.text)
      lines.forEach((lineText, idx) => {
        if (re.test(lineText) === invert) return
        matched = true
        const prefix =
          (multi ? `${p.name}:` : '') + (withNumber ? `${idx + 1}:` : '')
        io.stdout.writeLine(prefix + lineText)
      })
    }

    for (const e of errors) io.stderr.writeLine(`grep: ${e.path}: ${vfsMessage(e.code)}`)
    if (errors.length > 0) return 2
    return matched ? 0 : 1        // 与 grep 一致：无匹配是退出码 1
  },
}
