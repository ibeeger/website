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

  // 选中当前语言时 useLang 的 setState 同值 bail out，内核不重建、文件也还在。
  // 照样打「已清空」会让用户以为自己 touch 出来的东西没了。
  it('切换到当前已是的语言时不谎报临时文件被清空', async () => {
    const { ctx } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang', 'en'], ctx)
    expect(r.out).not.toMatch(/清空|临时|cleared/i)
  })

  it('Tab 补全给出语言前缀匹配', () => {
    const { ctx } = ctxWithLang('en')
    expect(lang.complete!(['lang', 'z'], ctx)).toEqual(['zh'])
  })
})

describe('lang 的输出跟随当前语言', () => {
  it('非法值报错跟着当前语言走', async () => {
    const en = await runCmd(lang, ['lang', 'klingon'], ctxWithLang('en').ctx)
    const zh = await runCmd(lang, ['lang', 'klingon'], ctxWithLang('zh').ctx)
    expect(en.err).toContain('klingon')
    expect(zh.err).toContain('klingon')
    expect(en.err).not.toMatch(/[一-龥]/)
    expect(zh.err).toMatch(/[一-龥]/)
  })

  // 断言的是提示语这个「框」，不是里面嵌的语言标签 —— 标签用自称，英文提示里
  // 本来就会出现「中文」两个字，拿「整句有没有汉字」判语言会把它误判成中文提示。
  it('切换成功提示跟着切换前的语言走 —— 用户读到的是他此刻还看得懂的那种', async () => {
    const en = await runCmd(lang, ['lang', 'zh'], ctxWithLang('en').ctx)
    const zh = await runCmd(lang, ['lang', 'en'], ctxWithLang('zh').ctx)
    expect(en.out).toContain('Interface language switched to')
    expect(en.out).not.toContain('语言已切换为')
    expect(zh.out).toContain('语言已切换为')
    expect(zh.out).not.toContain('Interface language switched to')
  })

  // 同上：钉提示语的框，不钉里面的标签。
  it('「已经是当前语言」的提示跟着语言走', async () => {
    const en = await runCmd(lang, ['lang', 'en'], ctxWithLang('en').ctx)
    const zh = await runCmd(lang, ['lang', 'zh'], ctxWithLang('zh').ctx)
    expect(en.out).toContain('is already in')
    expect(en.out).not.toContain('当前语言已经是')
    expect(zh.out).toContain('当前语言已经是')
    expect(zh.out).not.toContain('is already in')
  })
})

// 切语言重建的是整个内核（useTerminal 里那个按 lang memo 的 createKernel）：
// VFS、env、cwd、history 全挂在上面，一并归零。只提「临时文件」会让用户以为
// 自己 export 的变量和 cd 到的目录还在。
describe('lang 的切换提示要说全丢了什么', () => {
  for (const [current, wanted, terms] of [
    ['en', 'zh', ['history', 'director', 'export']],
    ['zh', 'en', ['历史', '目录', 'export']],
  ] as const) {
    it(`${current} 下的提示同时提到历史、当前目录与导出的环境变量`, async () => {
      const r = await runCmd(lang, ['lang', wanted], ctxWithLang(current).ctx)
      for (const t of terms) expect(r.out.toLowerCase()).toContain(t.toLowerCase())
    })
  }
})

// 单独一组：标签是这条命令里唯一一处**不**跟随界面语言的输出，挂在
// 「输出跟随当前语言」底下会让分组名把它说反。这是有意的差别 —— 报错和提示
// 是说给当前用户听的，标签是给用户找自己那行用的。一个只读中文的访客落在
// 英文界面上，正是靠「中文」这三个字认出该点哪个，翻成 Chinese 他就找不着了。
describe('lang 的语言标签有意不跟随界面语言', () => {
  it('两种界面语言下都用自称，两行都在', async () => {
    for (const l of ['en', 'zh'] as const) {
      const r = await runCmd(lang, ['lang'], ctxWithLang(l).ctx)
      expect(r.out).toContain('English')
      expect(r.out).toContain('中文')
    }
  })
})
