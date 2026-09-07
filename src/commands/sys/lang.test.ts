import { describe, it, expect } from 'vitest'
import { lang } from './lang'
import { makeTestCtx, runCmd, testHost } from '../testkit'
import type { Ctx, Lang } from '../../core/process'

function ctxWithLang(current: Lang = 'en') {
  const calls: Lang[] = []
  const ctx: Ctx = {
    ...makeTestCtx(),
    host: { ...testHost, currentLang: () => current, setLang: (l: Lang) => { calls.push(l) } },
  }
  return { ctx, calls }
}

describe('lang', () => {
  it('无参数时列出可选语言并标记当前值', async () => {
    const { ctx } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang'], ctx)
    expect(r.code).toBe(0)
    expect(r.out).toContain('en')
    expect(r.out).toContain('zh')
    expect(r.out).toContain('*')      // 当前值有标记
  })

  it('标记跟着 host 当前值走，而不是固定标在第一项', async () => {
    const { ctx } = ctxWithLang('zh')
    const r = await runCmd(lang, ['lang'], ctx)
    const marked = r.out.split('\n').filter(l => l.includes('*'))
    expect(marked).toHaveLength(1)
    expect(marked[0]).toContain('zh')
  })

  it('切换到有效语言时调用 host.setLang，退出码 0', async () => {
    const { ctx, calls } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang', 'zh'], ctx)
    expect(r.code).toBe(0)
    expect(calls).toEqual(['zh'])
  })

  it('提示临时文件会丢失 —— 切换要重建 VFS，不说就是静默丢数据', async () => {
    const { ctx } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang', 'zh'], ctx)
    expect(r.out).toMatch(/临时|temporary/i)
  })

  it('非法语言报错、不调用 setLang、退出码 1', async () => {
    const { ctx, calls } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang', 'klingon'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('klingon')
    expect(calls).toEqual([])
  })

  it('切换到当前已是的语言不报错', async () => {
    const { ctx } = ctxWithLang('en')
    expect((await runCmd(lang, ['lang', 'en'], ctx)).code).toBe(0)
  })

  it('Tab 补全给出语言前缀匹配', () => {
    const { ctx } = ctxWithLang('en')
    expect(lang.complete!(['lang', 'z'], ctx)).toEqual(['zh'])
  })
})
