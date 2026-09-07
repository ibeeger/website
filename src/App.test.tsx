// @vitest-environment jsdom
import './ui/test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UI_TEXT } from './i18n/uiText'
import { LANG_STORAGE_KEY } from './i18n/lang'

Element.prototype.scrollIntoView ??= () => {}

// jsdom 的 localStorage 在同一个文件里跨用例存活，而这里正有用例往里写语言。
// 不清的话，写了 zh 的那条会把后面读默认语言的用例一起染成中文。
beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

describe('App', () => {
  it('正常路径下渲染出终端', async () => {
    const App = (await import('./App')).default
    render(<App />)
    expect(screen.getByRole('application', { name: UI_TEXT.en.terminalLabel })).toBeTruthy()
  })

  // useTerminal 的惰性初始化——buildInitialVfs(loadContent())——跑在
  // Terminal 组件的渲染期（useState 的初始化函数就是渲染期代码），
  // proc.run 的 try/catch 与内核执行器的兜底都覆盖不到这里。这条测试确认
  // App 根部的 ErrorBoundary 确实盖住了这一段，而不是只盖住了 chunk 渲染。
  it('loadContent 在渲染期抛出时（比如内容文件损坏），根边界兜住而不是白屏', async () => {
    vi.resetModules()
    vi.doMock('./content', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./content')>()
      return {
        ...actual,
        loadContent: () => { throw new Error('content 加载失败') },
      }
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const App = (await import('./App')).default
    render(<App />)

    expect(screen.queryByRole('application')).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()

    spy.mockRestore()
    vi.doUnmock('./content')
    vi.resetModules()
  })

  // 崩溃页挂在 useLang 之上，拿不到 hook 里那份语言状态；它只能自己读一次
  // localStorage。中文用户看到的兜底页若是英文，等于最后一句话也没读懂。
  it('崩溃页跟随存档里的语言：存了 zh 就用中文，且不掺英文那句', async () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'zh')
    vi.resetModules()
    vi.doMock('./content', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./content')>()
      return { ...actual, loadContent: () => { throw new Error('content 加载失败') } }
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const App = (await import('./App')).default
    render(<App />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe(UI_TEXT.zh.crash)
    expect(alert.textContent).not.toContain(UI_TEXT.en.crash)

    spy.mockRestore()
    vi.doUnmock('./content')
    vi.resetModules()
  })

  // localStorage 在隐私模式下会直接抛。崩溃页里再抛一次就没有第二道边界了，
  // 白屏取代兜底页——这条钉住那个 try/catch。
  it('读 localStorage 抛异常时崩溃页仍然画得出来，回落到默认语言', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage 被禁用')
    })
    vi.resetModules()
    vi.doMock('./content', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./content')>()
      return { ...actual, loadContent: () => { throw new Error('content 加载失败') } }
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const App = (await import('./App')).default
    render(<App />)

    expect(screen.getByRole('alert').textContent).toBe(UI_TEXT.en.crash)

    spy.mockRestore()
    getItem.mockRestore()
    vi.doUnmock('./content')
    vi.resetModules()
  })
})
