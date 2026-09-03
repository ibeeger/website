import { text, line, type Chunk, type Writer } from './process'

/**
 * 单生产者单消费者的异步 chunk 队列。
 * 不用 Web Streams：其背压与锁定语义在本场景无用，且难以单测。
 */
export function createPipe(): { writer: Writer; reader: AsyncIterable<Chunk> } {
  const queue: Chunk[] = []
  let closed = false
  let wake: (() => void) | null = null

  const notify = () => {
    const w = wake
    wake = null
    w?.()
  }

  const writer: Writer = {
    write(chunk: Chunk) {
      if (closed) throw new Error('write after close')
      queue.push(chunk)
      notify()
    },
    writeText(s: string, style?) {
      writer.write(text(s, style))
    },
    writeLine(s: string, style?) {
      writer.write(line(s, style))
    },
    close() {
      if (closed) return
      closed = true
      notify()
    },
  }

  const reader: AsyncIterable<Chunk> = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length > 0) {
          yield queue.shift()!
        }
        if (closed) return
        await new Promise<void>(resolve => { wake = resolve })
      }
    },
  }

  return { writer, reader }
}
