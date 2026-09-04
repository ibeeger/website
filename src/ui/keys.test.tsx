// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptLine } from './PromptLine'

function setup(value: string) {
  const onChange = vi.fn()
  const onClear = vi.fn()
  const onInterrupt = vi.fn()
  render(
    <PromptLine
      prompt="$ " value={value}
      onChange={onChange} onSubmit={vi.fn()}
      onHistoryPrev={vi.fn()} onHistoryNext={vi.fn()}
      onComplete={vi.fn()} onInterrupt={onInterrupt}
      onClearScreen={onClear} onReverseSearch={vi.fn()}
    />,
  )
  return { input: screen.getByRole('textbox'), onChange, onClear, onInterrupt }
}

describe('行编辑键位', () => {
  it('Ctrl+U 删到行首', () => {
    const { input, onChange } = setup('hello world')
    fireEvent.keyDown(input, { key: 'u', ctrlKey: true })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('Ctrl+W 删除前一个词', () => {
    const { input, onChange } = setup('hello world')
    fireEvent.keyDown(input, { key: 'w', ctrlKey: true })
    expect(onChange).toHaveBeenCalledWith('hello ')
  })

  it('Ctrl+W 跳过尾部空格', () => {
    const { input, onChange } = setup('hello world   ')
    fireEvent.keyDown(input, { key: 'w', ctrlKey: true })
    expect(onChange).toHaveBeenCalledWith('hello ')
  })

  it('Ctrl+L 触发清屏', () => {
    const { input, onClear } = setup('x')
    fireEvent.keyDown(input, { key: 'l', ctrlKey: true })
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('Ctrl+C 触发中断', () => {
    const { input, onInterrupt } = setup('x')
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })
    expect(onInterrupt).toHaveBeenCalledOnce()
  })
})
