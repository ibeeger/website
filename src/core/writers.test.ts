import { describe, it, expect } from 'vitest'
import { fileWriter, styled, textOnly } from './writers'
import { node, text, type Chunk, type Writer } from './process'
import { buildInitialVfs } from './vfs/bootstrap'

/** 记录所有写入与 close() 调用次数的 writer 替身。 */
function spy() {
  const chunks: Chunk[] = []
  let closeCalls = 0
  const writer: Writer = {
    write(c) { chunks.push(c) },
    writeText(s, style) { writer.write(text(s, style)) },
    writeLine(s, style) { writer.write(text(s + '\n', style)) },
    close() { closeCalls++ },
  }
  return { writer, chunks, closeCalls: () => closeCalls }
}

describe('styled', () => {
  it('close() 是空操作 —— 不关闭底层 writer', () => {
    const base = spy()
    const w = styled(base.writer, { color: 'red' })
    w.close()
    expect(base.closeCalls()).toBe(0)
  })

  it('给未样式化的文本 chunk 补上默认样式', () => {
    const base = spy()
    const w = styled(base.writer, { color: 'red' })
    w.writeText('plain')
    expect(base.chunks).toEqual([{ type: 'text', text: 'plain', style: { color: 'red' } }])
  })

  it('不覆盖调用方已指定的样式', () => {
    const base = spy()
    const w = styled(base.writer, { color: 'red' })
    w.writeText('own', { color: 'blue' })
    expect(base.chunks).toEqual([{ type: 'text', text: 'own', style: { color: 'blue' } }])
  })

  it('node chunk 原样透传，不被套用默认样式', () => {
    const base = spy()
    const w = styled(base.writer, { color: 'red' })
    const n = node(null, () => 'x')
    w.write(n)
    expect(base.chunks).toEqual([n])
  })
})

describe('textOnly', () => {
  it('node chunk 降级为文本', () => {
    const base = spy()
    const w = textOnly(base.writer)
    w.write(node(null, () => 'plain-form'))
    expect(base.chunks).toEqual([{ type: 'text', text: 'plain-form' }])
  })

  it('text chunk 原样透传', () => {
    const base = spy()
    const w = textOnly(base.writer)
    w.write(text('hi', { color: 'green' }))
    expect(base.chunks).toEqual([{ type: 'text', text: 'hi', style: { color: 'green' } }])
  })

  it('close() 委托给底层 writer', () => {
    const base = spy()
    const w = textOnly(base.writer)
    w.close()
    expect(base.closeCalls()).toBe(1)
  })
})

describe('fileWriter', () => {
  it('写入在 close() 之前不落盘', () => {
    const vfs = buildInitialVfs({})
    const w = fileWriter(vfs, '/out.txt', false)
    w.writeText('hello')
    expect(vfs.stat('/out.txt')).toBeNull()
  })

  it('close() 时一次性写入累积内容', () => {
    const vfs = buildInitialVfs({})
    const w = fileWriter(vfs, '/out.txt', false)
    w.writeText('hello ')
    w.writeText('world')
    w.close()
    expect(vfs.readFile('/out.txt')).toBe('hello world')
  })

  it('append 模式在 close() 时追加到已有内容', () => {
    const vfs = buildInitialVfs({ '/out.txt': 'old\n' })
    const w = fileWriter(vfs, '/out.txt', true)
    w.writeText('new\n')
    w.close()
    expect(vfs.readFile('/out.txt')).toBe('old\nnew\n')
  })

  it('write 模式在 close() 时覆盖已有内容', () => {
    const vfs = buildInitialVfs({ '/out.txt': 'old\n' })
    const w = fileWriter(vfs, '/out.txt', false)
    w.writeText('new\n')
    w.close()
    expect(vfs.readFile('/out.txt')).toBe('new\n')
  })

  it('close() 之后再写入抛错', () => {
    const vfs = buildInitialVfs({})
    const w = fileWriter(vfs, '/out.txt', false)
    w.close()
    expect(() => w.writeText('late')).toThrow(/write after close/)
  })

  it('重复 close() 只落盘一次，幂等', () => {
    const vfs = buildInitialVfs({})
    const w = fileWriter(vfs, '/out.txt', false)
    w.writeText('once')
    w.close()
    w.close()
    expect(vfs.readFile('/out.txt')).toBe('once')
  })
})
