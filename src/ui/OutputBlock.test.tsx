// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OutputBlock } from './OutputBlock'
import { node, text } from '../core/process'
import type { Block } from './types'

function blockWith(chunks: Block['chunks']): Block {
  return { id: 'b0', prompt: '$', input: 'boom', chunks, exitCode: 0 }
}

describe('OutputBlock', () => {
  it('正常 chunk 照常渲染', () => {
    render(<OutputBlock block={blockWith([text('hello')])} />)
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('node chunk 渲染阶段抛异常时，退回该 chunk 的 toText()、标红显示，不连累同一 block 的其它 chunk', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => { throw new Error('render kaboom') }
    const bad = node(<Boom />, () => 'plain fallback text')

    const { container } = render(
      <OutputBlock block={blockWith([text('before '), bad, text(' after')])} />,
    )

    // 前后两个普通 text chunk 是裸文本节点，没有自己的元素可查——
    // 直接断言渲染出的整体文本，同时确认它们没有被这条 boundary 连累掉。
    expect(container.textContent).toBe('$boombefore plain fallback text after')
    expect(screen.getByText('plain fallback text')).toBeTruthy()
    spy.mockRestore()
  })
})
