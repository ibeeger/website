import { node, type Process } from '../../core/process'
import { Markdown } from '../rich/Markdown'
import { readOrFail } from './about'

export const contact: Process = {
  name: 'contact',
  description: '联系方式',
  usage: 'contact',

  async run(io, ctx) {
    const source = readOrFail(ctx, 'contact.md')
    if (source === null) { io.stderr.writeLine('contact: contact.md 不存在'); return 1 }
    io.stdout.write(node(<Markdown source={source} />, () => source))
    return 0
  },
}
