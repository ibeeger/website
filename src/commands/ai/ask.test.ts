import { describe, it, expect } from 'vitest'
import { ask } from './ask'
import { makeTestCtx, runCmd, fakeAi } from '../testkit'
import type { AiStatus } from '../../core/ai/languageModel'

const FILES = {
  '/home/guest/about.md': '# 关于我\n\n全栈工程师，专注前端架构。\n',
  '/home/guest/skills.json': '{"groups":[{"name":"语言","items":[{"name":"TypeScript","level":5}]}]}\n',
  '/home/guest/projects/terminal-site.md': '# terminal-site\n\n从零实现的 shell。\n',
}

const ctxWith = (status: AiStatus, chunks: string[] = []) => {
  const ctx = makeTestCtx(FILES)
  const ai = fakeAi(status, chunks)
  return { ctx: { ...ctx, ai }, ai }
}

describe('ask —— 用法', () => {
  it('没有问题也没有管道输入时打印用法，退出码 2', async () => {
    const { ctx } = ctxWith({ kind: 'ready' })
    const r = await runCmd(ask, ['ask'], ctx)
    expect(r.code).toBe(2)
    expect(r.err).toContain('用法')
  })
})

describe('ask —— 可用性判断', () => {
  const unavailableCases: [AiStatus, string][] = [
    [{ kind: 'unsupported' }, 'chrome://flags'],
    [{ kind: 'unavailable' }, '硬件'],
    [{ kind: 'downloadable' }, '下载'],
    [{ kind: 'downloading' }, '正在下载'],
  ]

  for (const [status, expected] of unavailableCases) {
    it(`${status.kind} 时不调用模型，给出针对性说明，退出码 1`, async () => {
      const { ctx, ai } = ctxWith(status)
      const r = await runCmd(ask, ['ask', '你好'], ctx)
      expect(r.code).toBe(1)
      expect(r.err).toContain(expected)
      expect(ai.created).toBe(0)
    })
  }

  it('unsupported 的文案要说明模型跑在本地、不上传 —— 这是访客最先关心的', async () => {
    const { ctx } = ctxWith({ kind: 'unsupported' })
    const r = await runCmd(ask, ['ask', '你好'], ctx)
    expect(r.err).toContain('本地')
  })
})

describe('ask --status', () => {
  it('查询本身成功就退出码 0，即使模型不可用', async () => {
    const { ctx } = ctxWith({ kind: 'unsupported' })
    const r = await runCmd(ask, ['ask', '--status'], ctx)
    expect(r.code).toBe(0)
    expect(r.out).toContain('unsupported')
  })

  it('ready 时也报告状态，不需要提问', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' })
    const r = await runCmd(ask, ['ask', '--status'], ctx)
    expect(r.code).toBe(0)
    expect(r.out).toContain('ready')
    expect(ai.created).toBe(0)
  })
})

describe('ask —— 提问', () => {
  it('ready 时流式输出，分片按序拼接，退出码 0', async () => {
    const { ctx } = ctxWith({ kind: 'ready' }, ['我会 ', 'TypeScript', '。'])
    const r = await runCmd(ask, ['ask', '你会什么？'], ctx)
    expect(r.code).toBe(0)
    expect(r.out).toBe('我会 TypeScript。\n')
  })

  it('多个参数拼成一个问题 —— 不需要加引号', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', '你', '会', 'React', '吗'], ctx)
    expect(ai.prompts[0]).toContain('你 会 React 吗')
  })

  it('管道输入作为上下文拼进提问', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', '总结一下'], ctx, '这是一段很长的文本\n')
    expect(ai.prompts[0]).toContain('这是一段很长的文本')
    expect(ai.prompts[0]).toContain('总结一下')
  })

  it('只有管道输入、没有参数时也能提问', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' }, ['ok'])
    const r = await runCmd(ask, ['ask'], ctx, '解释这段代码\n')
    expect(r.code).toBe(0)
    expect(ai.prompts[0]).toContain('解释这段代码')
  })

  it('用完释放 session —— 模型常驻显存', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ai.destroyed).toBe(1)
  })

  it('模型中途抛异常时报错而不是崩掉，退出码 1', async () => {
    const ctx = { ...makeTestCtx(FILES), ai: fakeAi({ kind: 'ready' }, ['ok'], { throwOnPrompt: true }) }
    const r = await runCmd(ask, ['ask', 'hi'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('ask:')
  })
})

describe('ask —— 人设注入', () => {
  it('system prompt 里带上 about.md 的内容', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ai.systemPrompts[0]).toContain('全栈工程师，专注前端架构')
  })

  it('system prompt 里带上项目内容', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ai.systemPrompts[0]).toContain('从零实现的 shell')
  })

  it('system prompt 交代不知道就说不知道 —— 本地小模型容易编', async () => {
    const { ctx, ai } = ctxWith({ kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ai.systemPrompts[0]).toContain('不知道')
  })
})

describe('ask —— 中断', () => {
  it('已经 abort 的 signal 会传给模型，不产生输出', async () => {
    const ac = new AbortController()
    ac.abort()
    const ctx = { ...makeTestCtx(FILES), signal: ac.signal, ai: fakeAi({ kind: 'ready' }, ['a', 'b']) }
    const r = await runCmd(ask, ['ask', 'hi'], ctx)
    expect(r.out).toBe('')
    expect(r.code).toBe(1)
  })
})
