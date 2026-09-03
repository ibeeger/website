import { createPipe } from '../pipe'
import { formatError, vfsMessage } from '../errors'
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
  // toClose 必须先于任何可能抛出的语句建立 —— 否则抛出时下游 stdin 永不终止。
  const toClose: Writer[] = []
  if (downstream) toClose.push(downstream)

  // 永远指向终端的错误出口。重定向可能把 stderr 改到文件，
  // 但「准备阶段失败」和「落盘失败」必须让用户看见。
  const fatalOut = styled(terminal, STDERR_STYLE)

  let stdout: Writer = downstream ? textOnly(downstream) : terminal
  let stderr: Writer = fatalOut

  try {
    // 展开必须在 try 内：它一旦抛出，异常会逃到 UI，且下游 stdin 永久挂起。
    const argv = cmd.argv.flatMap(w => expandWord(w, ctx))
    const name = argv[0]

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
        stderr.writeLine(`bash: ${raw}: ${vfsMessage('ENOENT')}`)
        return 1
      }
      // 目标自身是目录时同样要挡住。fileWriter 直到 close() 才碰 VFS，
      // 而 close() 在 finally 里，那里抛出的 EISDIR 会被吞掉 —— 结果是静默的 exit 0。
      if (ctx.vfs.isDir(abs)) {
        stderr.writeLine(`bash: ${raw}: ${vfsMessage('EISDIR')}`)
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
  } catch (e) {
    // 展开或重定向准备阶段抛出 —— 绝不允许逃到 UI
    fatalOut.writeLine(formatError('bash', e))
    return 1
  } finally {
    // 必须关闭，否则下游进程的 stdin 永远等不到结束
    for (const w of toClose) {
      try {
        w.close()
      } catch (e) {
        // 落盘失败不能静默丢弃，否则用户看到 exit 0 却什么都没发生
        fatalOut.writeLine(formatError('bash', e))
      }
    }
  }
}
