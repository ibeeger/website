// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileKeyBar } from './MobileKeyBar'

describe('MobileKeyBar', () => {
  it('渲染出手机键盘打不出的按键', () => {
    render(<MobileKeyBar onKey={vi.fn()} />)
    for (const label of ['Tab', '^C', '↑', '↓', '|', '~']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('点击时回调对应的键名', () => {
    const onKey = vi.fn()
    render(<MobileKeyBar onKey={onKey} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tab' }))
    expect(onKey).toHaveBeenCalledWith('tab')
  })

  it('用 onMouseDown 阻止默认行为，避免输入框失焦', () => {
    const onKey = vi.fn()
    render(<MobileKeyBar onKey={onKey} />)
    const btn = screen.getByRole('button', { name: '|' })
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    btn.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
  })
})
