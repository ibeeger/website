// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { about } from './about'
import { projects } from './projects'
import { skills } from './skills'
import { contact } from './contact'
import { open as openCmd } from './open'
import { makeTestCtx, runCmd } from '../../commands/testkit'
import { chunkToText, type Chunk, type Ctx } from '../../core/process'

const FILES = {
  '/home/guest/about.md': '# 关于我\n\n一名工程师。\n\n- TypeScript\n- Rust\n',
  '/home/guest/contact.md': '# 联系方式\n\n- GitHub: https://github.com/example\n',
  '/home/guest/projects/alpha.md': '# alpha\n\n第一个项目。\n\n- 技术栈：Rust\n- 源码：https://example.com/alpha\n',
  '/home/guest/projects/beta.md': '# beta\n\n第二个项目。\n\n- 技术栈：TypeScript\n',
}

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx(FILES) })

/** 富 chunk 的降级文本 —— 管道下游看到的就是这个 */
const asText = (chunks: Chunk[]) => chunks.map(chunkToText).join('')

describe('about', () => {
  it('输出富节点', async () => {
    const r = await runCmd(about, ['about'], ctx)
    expect(r.code).toBe(0)
    expect(r.chunks.some(c => c.type === 'node')).toBe(true)
  })

  it('降级文本包含正文内容', async () => {
    const r = await runCmd(about, ['about'], ctx)
    expect(asText(r.chunks)).toContain('一名工程师')
  })

  it('about.md 缺失时报错而不是崩溃', async () => {
    const r = await runCmd(about, ['about'], makeTestCtx({}))
    expect(r.code).toBe(1)
    expect(r.err).toContain('about.md')
  })
})

describe('projects', () => {
  it('列出 projects 目录下的全部项目', async () => {
    const text = asText((await runCmd(projects, ['projects'], ctx)).chunks)
    expect(text).toContain('alpha')
    expect(text).toContain('beta')
  })

  it('降级文本可被 grep 命中', async () => {
    const text = asText((await runCmd(projects, ['projects'], ctx)).chunks)
    expect(text.split('\n').some(l => /Rust/.test(l))).toBe(true)
  })

  it('渲染出可点击的源码链接', async () => {
    const r = await runCmd(projects, ['projects'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    const { container } = render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
    const link = container.querySelector('a[href="https://example.com/alpha"]')
    expect(link).toBeTruthy()
    expect(link!.getAttribute('rel')).toContain('noopener')
  })

  it('目录为空时给出提示而不是空输出', async () => {
    const r = await runCmd(projects, ['projects'], makeTestCtx({ '/home/guest/about.md': '' }))
    expect(asText(r.chunks)).toContain('暂无')
  })
})

describe('skills', () => {
  it('按分组输出，且降级文本含等级', async () => {
    const text = asText((await runCmd(skills, ['skills'], ctx)).chunks)
    expect(text).toContain('TypeScript')
    expect(text).toMatch(/TypeScript.*[1-5]/)
  })

  it('渲染出条形图元素', async () => {
    const r = await runCmd(skills, ['skills'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    const { container } = render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
    expect(container.querySelectorAll('.skill-bar').length).toBeGreaterThan(0)
  })
})

describe('contact', () => {
  it('把链接渲染为可点击元素', async () => {
    const r = await runCmd(contact, ['contact'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    const { container } = render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
    expect(container.querySelector('a[href="https://github.com/example"]')).toBeTruthy()
  })
})

describe('open', () => {
  it('调用 window.open 并带上安全属性', async () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const r = await runCmd(openCmd, ['open', 'https://example.com'], ctx)
    expect(r.code).toBe(0)
    expect(spy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    spy.mockRestore()
  })

  it('拒绝非 http(s) 协议', async () => {
    const r = await runCmd(openCmd, ['open', 'javascript:alert(1)'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('只支持')
  })

  it('无参数返回 2', async () => {
    expect((await runCmd(openCmd, ['open'], ctx)).code).toBe(2)
  })
})
