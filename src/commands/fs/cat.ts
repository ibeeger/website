import { readSources } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const cat: Process = {
  name: 'cat',
  description: '打印文件内容',
  usage: 'cat [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const files = io.argv.slice(1)
    const { parts, errors } = await readSources(io, ctx, files)
    for (const p of parts) io.stdout.writeText(p.text)
    for (const e of errors) io.stderr.writeLine(`cat: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
