// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  it('子组件正常渲染时原样透出，不套任何东西', () => {
    render(
      <ErrorBoundary fallback={() => <span>fallback</span>}>
        <span>ok</span>
      </ErrorBoundary>,
    )
    expect(screen.getByText('ok')).toBeTruthy()
    expect(screen.queryByText('fallback')).toBeNull()
  })

  it('子组件渲染期抛出异常时，展示 fallback 而不是让异常冒泡卸载整棵树', () => {
    // React 会把渲染期异常打到 console.error；这里不关心那条日志，只关心
    // 页面没有变成白屏。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary fallback={error => <span>fallback: {String((error as Error).message)}</span>}>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('fallback: kaboom')).toBeTruthy()
    spy.mockRestore()
  })

  it('异常发生在兄弟节点旁边时，边界外的内容不受影响', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <span>survives</span>
        <ErrorBoundary fallback={() => <span>fallback</span>}>
          <Boom />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByText('survives')).toBeTruthy()
    expect(screen.getByText('fallback')).toBeTruthy()
    spy.mockRestore()
  })
})
