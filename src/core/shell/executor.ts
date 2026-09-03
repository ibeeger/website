import { createPipe } from '../pipe'
import { formatError } from '../errors'
import { fileWriter, styled, textOnly } from '../writers'
import { dirname } from '../vfs/path'
import { expandWord } from './expand'
import type { Ast, Command, Pipeline } from './parser'
import type { Chunk, Ctx, Writer } from '../process'

const STDERR_STYLE = { color: 'red' }

export async function execute(ast: Ast, ctx: Ctx, out: Writer): Promise<number> {
  let last = ctx.lastExitCode
  let i = 0
  while (i < ast.items.length) {
    const item = ast.items[i]!
    last = await runPipeline(item.pipeline, ctx, out)
    ctx.lastExitCode = last

    const join = item.joinNext
    if ((join === '&&' && last !== 0) || (join === '||' && last === 0)) {
      i = skipBranch(ast, i)
      continue
    }
    i++
  }
  return last
}

/** 短路：跳过后续由 && / || 串起来的项，直到跨过一个以 ; 或行尾结束的项。 */
function skipBranch(ast: Ast, from: number): number {
  let j = from
  while (j < ast.items.length) {
    const join = ast.items[j]!.joinNext
    if (join !== '&&' && join !== '||') break
    j++
  }
  return j + 1
}

async function runPipeline(pl: Pipeline, ctx: Ctx, out: Writer): Promise<number> {
  const n = pl.commands.length
  const pipes = Array.from({ length: Math.max(0, n - 1) }, () => createPipe())

  // 全部进程并发启动，靠管道的读写自然同步
  const codes = await Promise.all(
    pl.commands.map((cmd, idx) =>
      runCommand(
        cmd,
        ctx,
        idx === 0 ? null : pipes[idx - 1]!.reader,
        idx === n - 1 ? null : pipes[idx]!.writer,
        out,
      ),
    ),
  )
  return codes[n - 1] ?? 0
}

async function runCommand(
  cmd: Command,
  ctx: Ctx,
  stdin: AsyncIterable<Chunk> | null,
  downstream: Writer | null,
  terminal: Writer,
): Promise<number> {
  const argv = cmd.argv.flatMap(w => expandWord(w, ctx))
  const name = argv[0]

  // 本进程拥有、退出时必须关闭的 writer。不关会让下游 stdin 永久挂起。
  const toClose: Writer[] = []
  if (downstream) toClose.push(downstream)

  let stdout: Writer = downstream ? textOnly(downstream) : terminal
  let stderr: Writer = styled(terminal, STDERR_STYLE)

  try {
    for (const r of cmd.redirects) {
      const targets = expandWord(r.target, ctx)
      if (targets.length !== 1) {
        stderr.writeLine('bash: ambiguous redirect')
        return 1
      }
      const raw = targets[0]!
      const abs = ctx.vfs.resolve(ctx.cwd, raw)
      // 先验父目录，否则错误会推迟到 close() 里被吞掉
      if (!ctx.vfs.isDir(dirname(abs))) {
        stderr.writeLine(`bash: ${raw}: No such file or directory`)
        return 1
      }
      const fw = fileWriter(ctx.vfs, abs, r.mode === 'append')
      toClose.push(fw)
      if (r.fd === 1) stdout = fw
      else stderr = fw
    }

    if (name === undefined) return 0        // 只有重定向、没有命令
    if (ctx.signal.aborted) return 130

    const proc = ctx.registry.get(name)
    if (!proc) {
      stderr.writeLine(`bash: ${name}: command not found`)
      return 127
    }

    try {
      return await proc.run({ argv, stdin, stdout, stderr }, ctx)
    } catch (e) {
      // 兜底：命令的任何异常都不允许冒泡到 UI
      stderr.writeLine(formatError(name, e))
      return 1
    }
  } finally {
    for (const w of toClose) {
      try { w.close() } catch { /* 落盘失败不应掩盖原始错误 */ }
    }
  }
}
