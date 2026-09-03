import { describe, it, expect } from 'vitest'
import { createPipe } from './pipe'
import type { Chunk } from './process'

async function drain(reader: AsyncIterable<Chunk>): Promise<string[]> {
  const out: string[] = []
  for await (const c of reader) if (c.type === 'text') out.push(c.text)
  return out
}

describe('createPipe', () => {
  it('按写入顺序传递 chunk', async () => {
    const { writer, reader } = createPipe()
    writer.writeText('a')
    writer.writeText('b')
    writer.close()
    expect(await drain(reader)).toEqual(['a', 'b'])
  })

  it('close 使迭代终止', async () => {
    const { writer, reader } = createPipe()
    writer.close()
    expect(await drain(reader)).toEqual([])
  })

  it('消费者先于生产者到达时会等待', async () => {
    const { writer, reader } = createPipe()
    const collected = drain(reader)
    // 让消费者先进入等待状态
    await new Promise(r => setTimeout(r, 0))
    writer.writeText('late')
    writer.close()
    expect(await collected).toEqual(['late'])
  })

  it('writeLine 补换行', async () => {
    const { writer, reader } = createPipe()
    writer.writeLine('x')
    writer.close()
    expect(await drain(reader)).toEqual(['x\n'])
  })

  it('close 之后再写入抛错', () => {
    const { writer } = createPipe()
    writer.close()
    expect(() => writer.writeText('nope')).toThrow(/write after close/)
  })

  it('重复 close 是幂等的', () => {
    const { writer } = createPipe()
    writer.close()
    expect(() => writer.close()).not.toThrow()
  })
})
