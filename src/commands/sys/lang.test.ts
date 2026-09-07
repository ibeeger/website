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
  // 两行标签都得用当前语言称呼，而不是各用各的自称 —— 只断言「整段有/没有
  // 汉字」是抓不住的：中文列表里把 en 那行写成 English 照样满足「有汉字」。
  // 所以直接钉住那个「说的是另一种语言」的格子。
  it('列表里的语言标签跟着当前语言走 —— 英文站点上列一行中文标签就是混排', async () => {
    const en = await runCmd(lang, ['lang'], ctxWithLang('en').ctx)
    const zh = await runCmd(lang, ['lang'], ctxWithLang('zh').ctx)
    expect(en.out).toContain('Chinese')   // en 界面里 zh 那一行
    expect(en.out).not.toMatch(/[一-龥]/)
    expect(zh.out).toContain('英语')       // zh 界面里 en 那一行
    expect(zh.out).toContain('中文')
  })

  it('非法值报错跟着当前语言走', async () => {
    const en = await runCmd(lang, ['lang', 'klingon'], ctxWithLang('en').ctx)
    const zh = await runCmd(lang, ['lang', 'klingon'], ctxWithLang('zh').ctx)
    expect(en.err).toContain('klingon')
    expect(zh.err).toContain('klingon')
    expect(en.err).not.toMatch(/[一-龥]/)
    expect(zh.err).toMatch(/[一-龥]/)
  })

  it('切换成功提示跟着切换前的语言走 —— 用户读到的是他此刻还看得懂的那种', async () => {
    const en = await runCmd(lang, ['lang', 'zh'], ctxWithLang('en').ctx)
    const zh = await runCmd(lang, ['lang', 'en'], ctxWithLang('zh').ctx)
    expect(en.out).not.toMatch(/[一-龥]/)
    expect(zh.out).toMatch(/[一-龥]/)
  })

  it('「已经是当前语言」的提示跟着语言走', async () => {
    const en = await runCmd(lang, ['lang', 'en'], ctxWithLang('en').ctx)
    const zh = await runCmd(lang, ['lang', 'zh'], ctxWithLang('zh').ctx)
    expect(en.out).not.toMatch(/[一-龥]/)
    expect(zh.out).toMatch(/[一-龥]/)
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
