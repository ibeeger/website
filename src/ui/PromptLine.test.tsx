// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptLine } from './PromptLine'

function setup(overrides: Partial<Parameters<typeof PromptLine>[0]> = {}) {
  const onSubmit = vi.fn()
  const onChange = vi.fn()
  render(
    <PromptLine
      prompt="guest@terminal:~$ "
      value=""
      onChange={onChange}
      onSubmit={onSubmit}
      onHistoryPrev={vi.fn()}
      onHistoryNext={vi.fn()}
      onComplete={vi.fn()}
      onInterrupt={vi.fn()}
      onClearScreen={vi.fn()}
      onReverseSearch={vi.fn()}
      {...overrides}
    />,
  )
  return { onSubmit, onChange, input: screen.getByRole('textbox') }
}

describe('PromptLine', () => {
  it('渲染提示符', () => {
    setup()
    // 提示符的尾随空格是格式的一部分（"$ " 而不是 "$"），所以这里关掉
    // testing-library 默认的 trim 归一化 —— 否则它会先把节点文本尾部空格
    // 削掉，导致带尾随空格的期望值永远匹配不上。
    expect(screen.getByText('guest@terminal:~$ ', { trim: false })).toBeTruthy()
  })

  it('用的是真实的 input 元素，不是 contenteditable', () => {
    const { input } = setup()
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('contenteditable')).toBeNull()
  })

  it('输入时回调 onChange', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'ls' } })
    expect(onChange).toHaveBeenCalledWith('ls')
  })

  it('回车时提交当前值', () => {
    const { input, onSubmit } = setup({ value: 'ls -la' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('ls -la')
  })

  it('输入法组合期间回车不提交', () => {
    const { input, onSubmit } = setup({ value: '你好' })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('你好')
  })

  it('原生事件 isComposing 为真时回车不提交（即便我们自己的 composing 状态还没跟上）', () => {
    // 有些浏览器上，「用来上屏的那个回车」会在 compositionend 之前就派发一次
    // keydown，且这次 keydown 的 isComposing 仍是 true —— 只看 React 自己的
    // composing 状态（由 compositionstart/end 维护）会漏掉这种情况。这里不触发
    // compositionStart，只在原生事件上标 isComposing:true，专门盯住这道守卫。
    const { input, onSubmit } = setup({ value: '你好' })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('组合期间 Tab 不触发补全', () => {
    const onComplete = vi.fn()
    const { input } = setup({ onComplete })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('渲染出可见的自绘光标', () => {
    const { container } = render(
      <PromptLine
        prompt="$ " value="ab" onChange={vi.fn()} onSubmit={vi.fn()}
        onHistoryPrev={vi.fn()} onHistoryNext={vi.fn()}
        onComplete={vi.fn()} onInterrupt={vi.fn()}
        onClearScreen={vi.fn()} onReverseSearch={vi.fn()}
      />,
    )
    expect(container.querySelector('.cursor')).toBeTruthy()
  })

  it('真 input 是透明但可聚焦的', () => {
    const { input } = setup()
    const style = getComputedStyle(input)
    expect(style.display).not.toBe('none')
    expect(style.visibility).not.toBe('hidden')
  })
})
