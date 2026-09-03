import { text, type Chunk, type Writer } from '../core/process'
import type { Block } from './types'

type SetBlocks = (updater: (prev: Block[]) => Block[]) => void

/**
 * 把写入缓冲到微任务边界再一次性提交，避免逐行 setState。
 * 命令结束时调用 flushNow() 补上最后一批。
 */
export function createBlockWriter(
  blockId: string,
  setBlocks: SetBlocks,
): Writer & { flushNow(): void } {
  let pending: Chunk[] = []
  let scheduled = false

  const flush = () => {
    scheduled = false
    if (pending.length === 0) return
    const batch = pending
    pending = []
    setBlocks(prev =>
      prev.map(b => (b.id === blockId ? { ...b, chunks: [...b.chunks, ...batch] } : b)),
    )
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(flush)
  }

  const w: Writer & { flushNow(): void } = {
    write(c) { pending.push(c); schedule() },
    writeText(s, style) { w.write(text(s, style)) },
    writeLine(s, style) { w.write(text(s + '\n', style)) },
    close() { flush() },
    flushNow() { flush() },
  }
  return w
}
