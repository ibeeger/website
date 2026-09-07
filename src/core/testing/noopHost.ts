import type { Host } from '../process'

/**
 * 什么都不做的 Host。三处 core 测试原本各自维护一份字面量，
 * Host 每加一个方法就要改三处 —— 收敛到这里，加方法只改一处。
 * overrides 是必要的：三处测试对 listThemes 的期望各不相同。
 */
export function makeNoopHost(overrides: Partial<Host> = {}): Host {
  return {
    clear() {},
    setTheme() {},
    listThemes() { return ['dracula'] },
    currentTheme() { return 'dracula' },
    enterChat() {},
    setLang() {},
    currentLang() { return 'en' },
    ...overrides,
  }
}
