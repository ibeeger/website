// @vitest-environment jsdom
import './ui/test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

Element.prototype.scrollIntoView ??= () => {}

describe('App', () => {
  it('正常路径下渲染出终端', async () => {
    const App = (await import('./App')).default
    render(<App />)
    expect(screen.getByRole('application', { name: '交互式终端' })).toBeTruthy()
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
})
