import { chunkToText, type Chunk, type Ctx, type IO } from '../core/process'
import { VfsError } from '../core/vfs/vfs'

/**
 * 解析短选项。支持合并（-la）、`--` 终止符。
 * 不支持长选项 —— 本项目的命令都不需要。
 */
export function parseFlags(
  argv: string[],
  known: string[],
): { flags: Set<string>; operands: string[]; bad: string | null } {
  const flags = new Set<string>()
  const operands: string[] = []
  let bad: string | null = null
  let noMoreFlags = false

  for (const arg of argv.slice(1)) {
    if (noMoreFlags) { operands.push(arg); continue }
    if (arg === '--') { noMoreFlags = true; continue }
    if (arg.length > 1 && arg.startsWith('-')) {
      for (const ch of arg.slice(1)) {
        if (known.includes(ch)) flags.add(ch)
        else bad ??= ch
      }
      continue
    }
    operands.push(arg)      // 单独的 '-' 落到这里，表示标准输入
  }

  return { flags, operands, bad }
}

/** 把 stdin 全部读成一个字符串。富节点按 toText() 降级。 */
export async function readAll(stdin: AsyncIterable<Chunk> | null): Promise<string> {
  if (!stdin) return ''
  let s = ''
  for await (const c of stdin) s += chunkToText(c)
  return s
}

/**
 * 按 Unix 惯例取输入：给了文件就读文件，没给就读 stdin。
 * 读不到的文件收进 errors 由调用方决定如何报错，不中断其余文件。
 */
export async function readSources(
  io: IO,
  ctx: Ctx,
  files: string[],
): Promise<{ parts: { name: string; text: string }[]; errors: VfsError[] }> {
  if (files.length === 0) {
    return { parts: [{ name: '-', text: await readAll(io.stdin) }], errors: [] }
  }

  const parts: { name: string; text: string }[] = []
  const errors: VfsError[] = []
  for (const f of files) {
    if (f === '-') {
      parts.push({ name: '-', text: await readAll(io.stdin) })
      continue
    }
    try {
      parts.push({ name: f, text: ctx.vfs.readFile(ctx.vfs.resolve(ctx.cwd, f)) })
    } catch (e) {
      if (e instanceof VfsError) errors.push(e)
      else throw e
    }
  }
  return { parts, errors }
}
