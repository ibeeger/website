// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OutputBlock } from './OutputBlock'
import { node, text } from '../core/process'
import { UI_TEXT } from '../i18n/uiText'
import type { Block } from './types'

function blockWith(chunks: Block['chunks']): Block {
  return { id: 'b0', prompt: '$', input: 'boom', chunks, exitCode: 0 }
}

describe('OutputBlock', () => {
  it('正常 chunk 照常渲染', () => {
    render(<OutputBlock block={blockWith([text('hello')])} lang="en" />)
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('node chunk 渲染阶段抛异常时，退回该 chunk 的 toText()、标红显示，不连累同一 block 的其它 chunk', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = () => { throw new Error('render kaboom') }
    const bad = node(<Boom />, () => 'plain fallback text')

    const { container } = render(
      <OutputBlock block={blockWith([text('before '), bad, text(' after')])} lang="en" />,
    )

    // 前后两个普通 text chunk 是裸文本节点，没有自己的元素可查——
    // 直接断言渲染出的整体文本，同时确认它们没有被这条 boundary 连累掉。
    expect(container.textContent).toBe('$boombefore plain fallback text after')
    expect(screen.getByText('plain fallback text')).toBeTruthy()
    spy.mockRestore()
  })

  it('chat block 在 thinking 阶段渲染思考指示器', () => {
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [],
      exitCode: null, kind: 'chat', phase: 'thinking',
    }
    const { container } = render(<OutputBlock block={block} lang="en" />)
    // 直接查指示器自己的 class，而不是 [aria-busy]：streaming 中的 chat block
    // 整块也带 aria-busy（抑制读屏逐分片重播），拿那个属性当指示器的替身会
    // 把两件不相干的事混在一起，两边都测不准。
    expect(container.querySelector('.chat-thinking')).toBeTruthy()
  })

  it('chat block 进入 streaming 后不再渲染思考指示器', () => {
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [text('回答')],
      exitCode: null, kind: 'chat', phase: 'streaming',
    }
    const { container } = render(<OutputBlock block={block} lang="en" />)
    expect(container.querySelector('.chat-thinking')).toBeNull()
  })

  it('streaming 中的 chat block 整块标记 aria-busy —— 否则读屏每来一个分片就把整段回答重播一遍', () => {
    // 投影把一整轮压成一个 chunk，分片是"整体替换同一个文本节点"；外层
    // live region 的 aria-relevant 默认含 text，会把这种替换当成新增。
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [text('回答')],
      exitCode: null, kind: 'chat', phase: 'streaming',
    }
    const { container } = render(<OutputBlock block={block} lang="en" />)
    expect(container.querySelector('.block-chat')?.getAttribute('aria-busy')).toBe('true')
  })

  it('回到 idle 后摘掉 aria-busy —— 一直挂着的话这一轮的回答永远播报不出来', () => {
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [text('回答')],
      exitCode: null, kind: 'chat', phase: 'idle',
    }
    const { container } = render(<OutputBlock block={block} lang="en" />)
    expect(container.querySelector('.block-chat')?.getAttribute('aria-busy')).toBeNull()
  })

  it('中断的 chat block 显示已中断，且保留已生成的内容', () => {
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [text('半句')],
      exitCode: null, kind: 'chat', phase: 'idle', interrupted: true,
    }
    render(<OutputBlock block={block} lang="en" />)
    expect(screen.getByText(UI_TEXT.en.interrupted)).toBeTruthy()
    expect(screen.getByText(/半句/)).toBeTruthy()
  })

  // <html lang> 是 en，中断标记若永远是中文，读屏会拿英文音系去念那三个汉字，
  // 出来的是噪音或干脆静默——这一条钉住它跟着界面语言走。
  it('中断标记跟随界面语言 —— 两种语言各显示自己那句，且不互相串台', () => {
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [],
      exitCode: null, kind: 'chat', phase: 'idle', interrupted: true,
    }
    const en = render(<OutputBlock block={block} lang="en" />).container
    expect(en.querySelector('.t-dim')?.textContent).toBe(UI_TEXT.en.interrupted)
    expect(en.textContent).not.toContain(UI_TEXT.zh.interrupted)

    const zh = render(<OutputBlock block={block} lang="zh" />).container
    expect(zh.querySelector('.t-dim')?.textContent).toBe(UI_TEXT.zh.interrupted)
  })

  it('把界面语言透传给思考指示器 —— 指示器自己没有别的语言来源', () => {
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [],
      exitCode: null, kind: 'chat', phase: 'thinking',
    }
    const zh = render(<OutputBlock block={block} lang="zh" />).container
    expect(zh.querySelector('.chat-thinking')?.textContent).toContain(UI_TEXT.zh.thinking)
  })

  it('出错的 chat block 标红显示错误', () => {
    const block: Block = {
      id: 'b1', prompt: 'ask> ', input: '你好', chunks: [],
      exitCode: null, kind: 'chat', phase: 'idle', error: '模型炸了',
    }
    const { container } = render(<OutputBlock block={block} lang="en" />)
    expect(container.querySelector('.t-red')?.textContent).toContain('模型炸了')
  })

  it('普通 block 不受影响 —— 没有 kind 时行为与从前一致', () => {
    const block: Block = {
      id: 'b1', prompt: '$ ', input: 'ls', chunks: [text('a.md')], exitCode: 0,
    }
    const { container } = render(<OutputBlock block={block} lang="en" />)
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(container.querySelector('.block-chat')).toBeNull()
  })
})
