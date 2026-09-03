// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Terminal } from './Terminal'

// jsdom 没实现 scrollIntoView；Terminal 的自动滚底效果会调用它，不垫一个空实现
// 每个渲染了 <Terminal /> 的测试都会因为不相关的 TypeError 而炸掉。
Element.prototype.scrollIntoView ??= () => {}

describe('Terminal', () => {
  it('命令运行期间与结束后，input 都不会被 disabled，焦点也不会丢（回归：曾经因 disabled={running} 被浏览器踢到 body）', async () => {
    render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'echo hi' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // 命令还没跑完的这一刻：submit() 已经同步把 running 置真了。
    // 这是能真正区分「有没有 disabled={term.running}」的时机——
    // 等命令跑完再查，两种写法看到的 disabled 都已经是 false，测不出区别。
    expect(input.disabled).toBe(false)

    // 等命令真正跑完：输出出现在屏幕上
    await waitFor(() => expect(screen.getByText('hi')).toBeTruthy())

    expect(input.disabled).toBe(false)
    expect(document.activeElement).toBe(input)

    // 焦点没丢，才谈得上「打字有反应」：确认这个 input 仍然在正常接收输入
    fireEvent.change(input, { target: { value: 'x' } })
    expect(input.value).toBe('x')
  })
})
