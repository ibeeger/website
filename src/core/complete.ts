import type { Ctx } from './process'

/**
 * 补全一个路径片段。返回的候选是**完整片段**（含原有的目录前缀），
 * UI 可直接用它替换掉用户已输入的片段。目录候选带尾斜杠。
 */
export function completePath(
  frag: string,
  ctx: Ctx,
  opts: { dirsOnly?: boolean } = {},
): string[] {
  const slash = frag.lastIndexOf('/')
  const dirFrag = slash < 0 ? '' : frag.slice(0, slash + 1)   // 保留尾斜杠
  const base = slash < 0 ? frag : frag.slice(slash + 1)

  const home = ctx.env.get('HOME') ?? '/'
  const lookupTarget = dirFrag === ''
    ? '.'
    : dirFrag.startsWith('~/') ? home + dirFrag.slice(1) : dirFrag
  const absDir = ctx.vfs.resolve(ctx.cwd, lookupTarget)

  let entries
  try {
    entries = ctx.vfs.list(absDir)
  } catch {
    return []
  }

  return entries
    .filter(e => e.name.startsWith(base))
    .filter(e => base.startsWith('.') || !e.name.startsWith('.'))
    .filter(e => !opts.dirsOnly || e.kind === 'dir')
    .map(e => dirFrag + e.name + (e.kind === 'dir' ? '/' : ''))
}
