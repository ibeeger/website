import { describe, it, expect, beforeEach } from 'vitest'
import { cat } from './fs/cat'
import { head } from './fs/head'
import { tail } from './fs/tail'
import { wc } from './fs/wc'
import { echo } from './text/echo'
import { grep } from './text/grep'
import { sort } from './text/sort'
import { uniq } from './text/uniq'
import { makeTestCtx, runCmd } from './testkit'
import type { Ctx } from '../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('cat', () => {
  it('打印文件内容', async () => {
    expect((await runCmd(cat, ['cat', 'apple.md'], ctx)).out).toBe('apple\n')
  })

  it('按顺序拼接多个文件', async () => {
    const r = await runCmd(cat, ['cat', 'apple.md', 'apple.md'], ctx)
    expect(r.out).toBe('apple\napple\n')
  })

  it('无参数时读 stdin', async () => {
    expect((await runCmd(cat, ['cat'], ctx, 'piped')).out).toBe('piped')
  })

  it('文件不存在时报错并返回 1', async () => {
    const r = await runCmd(cat, ['cat', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('No such file or directory')
  })

  it('读目录时报 Is a directory', async () => {
    expect((await runCmd(cat, ['cat', 'projects'], ctx)).err).toContain('Is a directory')
  })
})

describe('head / tail', () => {
  it('head 默认取前 10 行', async () => {
    expect((await runCmd(head, ['head', 'about.md'], ctx)).out).toBe('line one\nline two\nline three\n')
  })

  it('head -n 限制行数', async () => {
    expect((await runCmd(head, ['head', '-n', '2', 'about.md'], ctx)).out).toBe('line one\nline two\n')
  })

  it('tail -n 取末尾行', async () => {
    expect((await runCmd(tail, ['tail', '-n', '1', 'about.md'], ctx)).out).toBe('line three\n')
  })

  it('-n 参数非法时返回 2', async () => {
    expect((await runCmd(head, ['head', '-n', 'x', 'about.md'], ctx)).code).toBe(2)
  })
})

describe('wc', () => {
  it('默认输出行数、词数、字节数', async () => {
    expect((await runCmd(wc, ['wc', 'apple.md'], ctx)).out.trim()).toBe('1 1 6 apple.md')
  })

  it('-l 只输出行数', async () => {
    expect((await runCmd(wc, ['wc', '-l', 'about.md'], ctx)).out.trim()).toBe('3 about.md')
  })

  it('读 stdin 时不带文件名', async () => {
    expect((await runCmd(wc, ['wc', '-l'], ctx, 'a\nb\n')).out.trim()).toBe('2')
  })

  it('-c 按 UTF-8 字节数计，多字节字符下与字符数不同', async () => {
    // '中文\n'：2 个汉字各占 3 字节 + 1 个换行字节 = 7 字节，
    // 而 .length（UTF-16 码元数）只有 3 —— 用来钉住必须按字节而非码元计数。
    const r = await runCmd(wc, ['wc', '-c'], ctx, '中文\n')
    expect(r.out.trim()).toBe('7')
  })
})

describe('echo', () => {
  it('打印参数并换行', async () => {
    expect((await runCmd(echo, ['echo', 'a', 'b'], ctx)).out).toBe('a b\n')
  })

  it('-n 抑制末尾换行', async () => {
    expect((await runCmd(echo, ['echo', '-n', 'a'], ctx)).out).toBe('a')
  })

  it('无参数时只输出换行', async () => {
    expect((await runCmd(echo, ['echo'], ctx)).out).toBe('\n')
  })
})

describe('grep', () => {
  it('输出匹配行', async () => {
    expect((await runCmd(grep, ['grep', 'two', 'about.md'], ctx)).out).toBe('line two\n')
  })

  it('无匹配时返回 1', async () => {
    expect((await runCmd(grep, ['grep', 'zzz', 'about.md'], ctx)).code).toBe(1)
  })

  it('-i 忽略大小写', async () => {
    expect((await runCmd(grep, ['grep', '-i', 'TWO', 'about.md'], ctx)).out).toBe('line two\n')
  })

  it('-v 反向匹配', async () => {
    expect((await runCmd(grep, ['grep', '-v', 'two', 'about.md'], ctx)).out).toBe('line one\nline three\n')
  })

  it('-n 前缀行号', async () => {
    expect((await runCmd(grep, ['grep', '-n', 'two', 'about.md'], ctx)).out).toBe('2:line two\n')
  })

  it('从 stdin 读取', async () => {
    expect((await runCmd(grep, ['grep', 'b'], ctx, 'a\nb\n')).out).toBe('b\n')
  })

  it('缺少模式时返回 2', async () => {
    expect((await runCmd(grep, ['grep'], ctx)).code).toBe(2)
  })

  it('非法正则不崩溃，报错返回 2', async () => {
    const r = await runCmd(grep, ['grep', '[', 'about.md'], ctx)
    expect(r.code).toBe(2)
    expect(r.err).toContain('invalid')
  })

  it('文件不存在时返回 2（与 cat 的 1 不同，是有意为之）', async () => {
    // 真实 grep 对任何错误都退出 2，把 1 留给「无匹配」；
    // cat 这类命令没有「无匹配」这回事，文件缺失就是唯一的失败，退出 1。
    expect((await runCmd(grep, ['grep', 'pattern', 'nope'], ctx)).code).toBe(2)
    expect((await runCmd(cat, ['cat', 'nope'], ctx)).code).toBe(1)
  })
})

describe('sort / uniq', () => {
  it('sort 按字典序', async () => {
    expect((await runCmd(sort, ['sort'], ctx, 'b\na\nc\n')).out).toBe('a\nb\nc\n')
  })

  it('sort -r 逆序', async () => {
    expect((await runCmd(sort, ['sort', '-r'], ctx, 'a\nb\n')).out).toBe('b\na\n')
  })

  it('uniq 折叠相邻重复行', async () => {
    expect((await runCmd(uniq, ['uniq'], ctx, 'a\na\nb\na\n')).out).toBe('a\nb\na\n')
  })

  it('uniq -c 前缀计数', async () => {
    expect((await runCmd(uniq, ['uniq', '-c'], ctx, 'a\na\nb\n')).out).toBe('      2 a\n      1 b\n')
  })
})
