import { describe, it, expect } from 'vitest'
import { makeNoopHost } from './noopHost'

describe('makeNoopHost', () => {
  it('所有方法都可调用且不抛异常 —— 它的全部职责就是「什么都不做」', () => {
    const h = makeNoopHost()
    expect(() => { h.clear(); h.setTheme('x'); h.enterChat({ systemPrompt: 's' }); h.setLang('zh') }).not.toThrow()
  })

  it('默认返回 en —— 与站点默认语言一致，测试里不必每次显式指定', () => {
    expect(makeNoopHost().currentLang()).toBe('en')
  })

  it('可以按需覆盖单个方法 —— 三处 core 测试对 listThemes 的期望各不相同', () => {
    const h = makeNoopHost({ listThemes: () => ['dracula'] })
    expect(h.listThemes()).toEqual(['dracula'])
    expect(h.currentTheme()).toBe('dracula')   // 未覆盖的部分保持默认
  })
})
