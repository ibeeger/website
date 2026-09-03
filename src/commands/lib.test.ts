import { describe, it, expect } from 'vitest'
import { parseFlags, readAll, readSources } from './lib'
import { createPipe } from '../core/pipe'
import { makeTestCtx } from './testkit'
import type { IO } from '../core/process'

describe('parseFlags', () => {
  it('拆开合并的短选项', () => {
    const r = parseFlags(['ls', '-la'], ['l', 'a'])
    expect([...r.flags].sort()).toEqual(['a', 'l'])
    expect(r.bad).toBeNull()
  })

  it('分离操作数', () => {
    expect(parseFlags(['ls', '-l', 'dir'], ['l']).operands).toEqual(['dir'])
  })

  it('未知选项报告到 bad', () => {
    expect(parseFlags(['ls', '-z'], ['l']).bad).toBe('z')
  })

  it('-- 之后全部当作操作数', () => {
    expect(parseFlags(['rm', '--', '-weird'], ['f']).operands).toEqual(['-weird'])
  })

  it('单独的 - 是操作数不是选项', () => {
    expect(parseFlags(['cat', '-'], []).operands).toEqual(['-'])
  })
})

describe('readAll', () => {
  it('stdin 为 null 时返回空串', async () => {
    expect(await readAll(null)).toBe('')
  })

  it('拼接全部 chunk', async () => {
    const p = createPipe()
    p.writer.writeText('a')
    p.writer.writeText('b')
    p.writer.close()
    expect(await readAll(p.reader)).toBe('ab')
  })
})

describe('readSources', () => {
  const io = (stdin: IO['stdin']): IO =>
    ({ argv: [], stdin, stdout: null as never, stderr: null as never })

  it('无文件参数时读 stdin', async () => {
    const p = createPipe()
    p.writer.writeText('from stdin')
    p.writer.close()
    const r = await readSources(io(p.reader), makeTestCtx(), [])
    expect(r.parts).toEqual([{ name: '-', text: 'from stdin' }])
  })

  it('按顺序读取多个文件', async () => {
    const r = await readSources(io(null), makeTestCtx(), ['apple.md', 'about.md'])
    expect(r.parts.map(p => p.name)).toEqual(['apple.md', 'about.md'])
    expect(r.parts[0]!.text).toBe('apple\n')
  })

  it('读不到的文件记入 errors，其余照常返回', async () => {
    const r = await readSources(io(null), makeTestCtx(), ['nope.md', 'apple.md'])
    expect(r.errors).toHaveLength(1)
    expect(r.parts.map(p => p.name)).toEqual(['apple.md'])
  })
})
