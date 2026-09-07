// @vitest-environment jsdom
import '../test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { about } from './about'
import { projects } from './projects'
import { skills } from './skills'
import { contact } from './contact'
import { resume } from './resume'
import { open as openCmd } from './open'
import { matrix } from './matrix'
import { makeTestCtx, runCmd } from '../../commands/testkit'
import { chunkToText, type Chunk, type Ctx } from '../../core/process'

const FILES = {
  '/home/guest/about.md': '# 关于我\n\n一名工程师。\n\n- TypeScript\n- Rust\n',
  '/home/guest/contact.md': '# 联系方式\n\n- GitHub: https://github.com/example\n',
  '/home/guest/projects/alpha.md': '# alpha\n\n第一个项目。\n\n- 技术栈：Rust\n- 源码：https://example.com/alpha\n',
  '/home/guest/projects/beta.md': '# beta\n\n第二个项目。\n\n- 技术栈：TypeScript\n',
  // 技能表和其它内容一样住在 VFS 里 —— 命令读的就是这份，换语言时整棵树被换掉。
  '/home/guest/skills.json': JSON.stringify({
    groups: [{ name: '语言', items: [{ name: 'TypeScript', level: 5 }] }],
  }, null, 2) + '\n',
}

// 另一棵文件树上的技能表。名字刻意取成真实 content/en/skills.json 里不会出现的，
// 这样「输出来自 VFS」和「输出来自直接 import 的英文 JSON」才区分得开 ——
// 用真实数据里也有的名字，两种实现都会通过，用例就白写了。
const OTHER_SKILLS = JSON.stringify({
  groups: [{ name: 'Esolang', items: [{ name: 'Brainfuck', level: 2 }] }],
}, null, 2) + '\n'

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

  // 技能表若直接 import JSON 就绕过了 VFS：换语言换掉的是文件树，绕过它的
  // 命令会一直显示英文那份。这条用例把「输出来自 VFS」钉住。
  it('技能表来自 VFS —— 换一棵文件树就换一份技能表', async () => {
    const other = makeTestCtx({ ...FILES, '/home/guest/skills.json': OTHER_SKILLS })
    const text = asText((await runCmd(skills, ['skills'], other)).chunks)
    expect(text).toContain('Brainfuck')
    expect(text).not.toContain('Languages')   // 真实英文技能表的分组名
  })

  it('skills.json 缺失时报错而不是崩溃', async () => {
    const r = await runCmd(skills, ['skills'], makeTestCtx({}))
    expect(r.code).toBe(1)
    expect(r.err).toContain('skills.json')
  })

  // node chunk 在 React 渲染阶段才求值，那时 proc.run 的 try/catch 早已返回：
  // 不前置校验的话，坏数据只会被 OutputBlock 的 ErrorBoundary 兜成一行标红的
  // 降级文本，退出码仍是 0、stderr 仍是空的。
  it('skills.json 不是合法 JSON 时报错而不是把坏数据送进渲染', async () => {
    const r = await runCmd(skills, ['skills'], makeTestCtx({ '/home/guest/skills.json': '{ 坏掉了' }))
    expect(r.code).toBe(1)
    expect(r.chunks.some(c => c.type === 'node')).toBe(false)
  })

  it('skills.json 结构不对时同样报错', async () => {
    const r = await runCmd(skills, ['skills'], makeTestCtx({ '/home/guest/skills.json': '{"groups": [{"name": 1}]}' }))
    expect(r.code).toBe(1)
  })
})

// resume 是拼 about + skills + projects + contact 的旗舰命令，站点内容改动
// 最容易波及它，之前却是 site.test.tsx 里唯一没有测试的兄弟命令。
describe('resume', () => {
  it('输出富节点', async () => {
    const r = await runCmd(resume, ['resume'], ctx)
    expect(r.code).toBe(0)
    expect(r.chunks.some(c => c.type === 'node')).toBe(true)
  })

  it('降级文本汇聚了 about / skills / projects / contact 四个来源各自的内容', async () => {
    const text = asText((await runCmd(resume, ['resume'], ctx)).chunks)
    expect(text).toContain('一名工程师')          // about.md
    expect(text).toContain('TypeScript')          // skills.json
    expect(text).toContain('alpha')                // projects/alpha.md
    expect(text).toContain('第一个项目')            // projects/alpha.md
    expect(text).toContain('GitHub')                // contact.md
  })

  it('toText 可被 grep 命中', async () => {
    const r = await runCmd(resume, ['resume'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    const text = (nodeChunk as { toText: () => string }).toText()
    expect(text.split('\n').some(l => /alpha/.test(l))).toBe(true)
  })

  it('技能段落来自 VFS —— 换一棵文件树就换一份技能表', async () => {
    const other = makeTestCtx({ ...FILES, '/home/guest/skills.json': OTHER_SKILLS })
    const text = asText((await runCmd(resume, ['resume'], other)).chunks)
    expect(text).toContain('Brainfuck')
    expect(text).not.toContain('Languages')   // 真实英文技能表的分组名
  })

  // 简历是拼四段的，技能读不出来不该让整页消失 —— about / contact 缺失时也是这么处理的。
  it('skills.json 缺失时其余段落照常输出', async () => {
    const r = await runCmd(resume, ['resume'], makeTestCtx({
      '/home/guest/about.md': '# 关于我\n\n一名工程师。\n',
    }))
    expect(r.code).toBe(0)
    expect(asText(r.chunks)).toContain('一名工程师')
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

describe('matrix', () => {
  it('标记为 hidden', () => {
    expect(matrix.hidden).toBe(true)
  })

  it('toText 给出可读的降级文本', async () => {
    const r = await runCmd(matrix, ['matrix'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    expect((nodeChunk as { toText: () => string }).toText()).toBe('[matrix rain]')
  })

  describe('生命周期', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('多帧运行不抛出，卸载时清掉计时器', async () => {
      const r = await runCmd(matrix, ['matrix'], ctx)
      const nodeChunk = r.chunks.find(c => c.type === 'node')!
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

      const { unmount } = render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
      // 跑够多帧，确认动画期间不抛异常（act 会把组件抛出的错误重新抛给这里）
      for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(90) })

      unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()
      expect(clearTimeoutSpy).toHaveBeenCalled()

      // 卸载后再推进时间：不应该再产生任何状态更新（不会有 act 警告，也不会抛出）
      act(() => { vi.advanceTimersByTime(10_000) })

      clearIntervalSpy.mockRestore()
      clearTimeoutSpy.mockRestore()
    })

    it('运行两次互不影响，各自独立清理', async () => {
      const r1 = await runCmd(matrix, ['matrix'], ctx)
      const r2 = await runCmd(matrix, ['matrix'], ctx)
      const n1 = r1.chunks.find(c => c.type === 'node')!
      const n2 = r2.chunks.find(c => c.type === 'node')!
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

      const m1 = render(<>{(n1 as { node: React.ReactNode }).node}</>)
      const m2 = render(<>{(n2 as { node: React.ReactNode }).node}</>)
      act(() => { vi.advanceTimersByTime(200) })

      m1.unmount()
      m2.unmount()
      // 两个独立实例各自的 interval 都被清掉了（不是共享了一个计时器）
      expect(clearIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(2)

      clearIntervalSpy.mockRestore()
    })

    it('自身的停止计时器到点后自动清掉 interval，无需卸载', async () => {
      const r = await runCmd(matrix, ['matrix'], ctx)
      const nodeChunk = r.chunks.find(c => c.type === 'node')!
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

      render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
      act(() => { vi.advanceTimersByTime(6000) })

      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })
})
