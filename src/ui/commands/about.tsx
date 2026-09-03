import { node, type Ctx, type Process } from '../../core/process'
import { Markdown } from '../rich/Markdown'
import { VfsError } from '../../core/vfs/vfs'

function readOrFail(ctx: Ctx, rel: string): string | null {
  try {
    return ctx.vfs.readFile(ctx.vfs.resolve(ctx.env.get('HOME') ?? '/', rel))
  } catch (e) {
    if (e instanceof VfsError) return null
    throw e
  }
}

export const about: Process = {
  name: 'about',
  description: '关于我',
  usage: 'about',

  async run(io, ctx) {
    const source = readOrFail(ctx, 'about.md')
    if (source === null) { io.stderr.writeLine('about: about.md 不存在'); return 1 }
    io.stdout.write(node(<Markdown source={source} />, () => source))
    return 0
  },
}

export { readOrFail }
