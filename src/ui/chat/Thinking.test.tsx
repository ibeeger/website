// @vitest-environment jsdom
import '../test-setup'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Thinking } from './Thinking'
import { UI_TEXT } from '../../i18n/uiText'

afterEach(() => { vi.useRealTimers() })

describe('Thinking', () => {
  it('渲染可读的等待说明 —— 用户要知道在等什么', () => {
    render(<Thinking lang="en" />)
    expect(screen.getByText(UI_TEXT.en.thinking)).toBeTruthy()
  })

  it('对读屏软件宣告为忙碌状态', () => {
    const { container } = render(<Thinking lang="en" />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  // 这句是视觉可见的，也是 aria-live 区域里唯一会被播报的文本。ask 的进入引导
  // 已经按语言走了，用户敲完第一句就看到这里——它若永远是中文，英文界面上第一
  // 个反馈就是一行汉字。
  it('等待文案跟随界面语言 —— 两种语言各显示自己那句，且不互相串台', () => {
    const en = render(<Thinking lang="en" />).container
    expect(en.textContent).toContain(UI_TEXT.en.thinking)
    expect(en.textContent).not.toContain(UI_TEXT.zh.thinking)

    const zh = render(<Thinking lang="zh" />).container
    expect(zh.textContent).toContain(UI_TEXT.zh.thinking)
  })

  it('超过一秒后显示已等待秒数 —— 首次唤醒模型很慢，把耗时摆出来', () => {
    vi.useFakeTimers()
    render(<Thinking lang="en" />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText(/3s/)).toBeTruthy()
  })

  it('秒数不进入无障碍树 —— 外层已有 aria-live，秒数每秒变一次会让读屏重复播报', () => {
    vi.useFakeTimers()
    render(<Thinking lang="en" />)
    act(() => { vi.advanceTimersByTime(3000) })
    const secondsNode = screen.getByText(/3s/)
    expect(secondsNode.getAttribute('aria-hidden')).toBe('true')
  })
})
