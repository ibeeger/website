// @vitest-environment jsdom
import '../test-setup'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Thinking } from './Thinking'

afterEach(() => { vi.useRealTimers() })

describe('Thinking', () => {
  it('渲染可读的等待说明 —— 用户要知道在等什么', () => {
    render(<Thinking />)
    expect(screen.getByText(/思考中/)).toBeTruthy()
  })

  it('对读屏软件宣告为忙碌状态', () => {
    const { container } = render(<Thinking />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('超过一秒后显示已等待秒数 —— 首次唤醒模型很慢，把耗时摆出来', () => {
    vi.useFakeTimers()
    render(<Thinking />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText(/3s/)).toBeTruthy()
  })
})
