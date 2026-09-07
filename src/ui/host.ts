import type { Host, Lang } from '../core/process'

export type UiHooks = {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
  enterChat(opts: { systemPrompt: string }): void
  setLang(lang: Lang): void
  currentLang(): Lang
}

/**
 * 内核只持有这个 Host 一次，但它每次调用都转发到 box.current 上的最新实现。
 * 没有这层间接，clear() 会捕获到首次渲染时的过期 setState 闭包。
 */
export function createUiHost(box: { current: UiHooks }): Host {
  return {
    clear() { box.current.clear() },
    setTheme(name) { box.current.setTheme(name) },
    listThemes() { return box.current.listThemes() },
    currentTheme() { return box.current.currentTheme() },
    enterChat(opts) { box.current.enterChat(opts) },
    setLang(lang) { box.current.setLang(lang) },
    currentLang() { return box.current.currentLang() },
  }
}
