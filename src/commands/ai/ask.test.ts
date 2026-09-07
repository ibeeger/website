import { describe, it, expect } from 'vitest'
import { ask } from './ask'
import { makeTestCtx, runCmd, fakeAi, recordingHost } from '../testkit'
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

describe('ask —— 可用性判断', () => {
  // downloadable 不在这里：一次性问答场景下它现在会触发下载并继续作答，
  // 不再是「不调用模型、直接报错」的分支——见下面「downloadable 时触发下载」用例。
  const unavailableCases: [AiStatus, string][] = [
    [{ kind: 'unsupported' }, 'chrome://flags'],
    [{ kind: 'unavailable' }, '硬件'],
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

  it('把 ctx.signal 交给 createSession —— 下载期间的 Ctrl+C 全靠它', async () => {
    // createSession 才是那 2GB 下载真正发生的地方，可能一挂十几分钟。只把
    // signal 传给 promptStreaming 的话，下载期间按 Ctrl+C 不会取消 create()，
    // run() 一直挂在那个 await 上、UI 的 abortRef 不释放，终端整个冻住。
    const ctx = { ...makeTestCtx(FILES), ai: fakeAi({ kind: 'downloadable' }, ['答']) }
    await runCmd(ask, ['ask', '你好'], ctx)
    expect(ctx.ai.signals[0]).toBe(ctx.signal)
  })

  it('下载进度按档去重 —— 密集的 downloadprogress 不会往 scrollback 灌几百行', async () => {
    // Writer 是纯追加契约，画不出原地刷新的一行；Chrome 在 2GB 下载期间会派发
    // 几百次事件。这里用 300 次铺满 0→1 的整个区间，模拟真实的派发密度。
    const progress = Array.from({ length: 300 }, (_, i) => i / 299)
    const ctx = { ...makeTestCtx(FILES), ai: fakeAi({ kind: 'downloadable' }, ['答'], { progress }) }
    const r = await runCmd(ask, ['ask', '你好'], ctx)

    const bars = r.out.split('\n').filter(l => l.startsWith('['))
    expect(bars.length).toBeLessThanOrEqual(21)
    // 首尾两档都必须留下：只报中间几档，等于不告诉用户什么时候开始、什么时候完成。
    expect(bars[0]).toContain('] 0%')
    expect(bars[bars.length - 1]).toContain('] 100%')
  })

  it('downloadable 时触发下载并输出进度', async () => {
    const ctx = {
      ...makeTestCtx(FILES),
      ai: fakeAi({ kind: 'downloadable' }, ['答'], { progress: [0.25, 1] }),
    }
    const r = await runCmd(ask, ['ask', '你好'], ctx)
    expect(r.out).toContain('开始下载')
    // 完整断言进度条字符串，而不只是百分比数字——20 格里 25% 对应 5 格 #。
    expect(r.out).toContain('[#####...............] 25%')
    expect(r.out).toContain('[####################] 100%')
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

describe('ask —— 进入对话模式', () => {
  it('无参数且模型 ready 时请求进入对话模式，退出码 0', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }) }
    const r = await runCmd(ask, ['ask'], ctx)
    expect(r.code).toBe(0)
    expect(host.chatCalls).toHaveLength(1)
  })

  it('进入模式时把简历作为 systemPrompt 带上', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }) }
    await runCmd(ask, ['ask'], ctx)
    expect(host.chatCalls[0]!.systemPrompt).toContain('全栈工程师，专注前端架构')
  })

  it('进入模式前打印引导 —— 否则屏幕上唯一的变化只是提示符，没人告诉用户怎么出去', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }) }
    const r = await runCmd(ask, ['ask'], ctx)
    expect(r.out).toContain('对话模式')
    // 三种退出方式都要写到：交互契约表里它们都成立，漏一种就是让用户少一条出路。
    expect(r.out).toContain('exit')
    expect(r.out).toContain('Ctrl+D')
    expect(r.out).toContain('Ctrl+C')
  })

  it('usage 把三种退出方式写全 —— 文案不得描述不存在的行为，也不该漏掉存在的', () => {
    expect(ask.usage).toContain('exit')
    expect(ask.usage).toContain('Ctrl+D')
    expect(ask.usage).toContain('Ctrl+C')
  })

  it('模型不可用时不进入模式 —— 不能让用户进去才发现跑不了', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'unsupported' }) }
    const r = await runCmd(ask, ['ask'], ctx)
    expect(host.chatCalls).toHaveLength(0)
    expect(r.code).toBe(1)
    expect(r.err).toContain('chrome://flags')
  })

  it('无参数时 downloadable 不触发下载、不进入对话模式 —— 用户还没表示要等 2GB', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'downloadable' }) }
    const r = await runCmd(ask, ['ask'], ctx)
    expect(host.chatCalls).toHaveLength(0)
    expect(r.code).toBe(1)
    expect(r.err).toContain('ask <问题>')
  })

  it('带问题时是一次性问答，不进入模式', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }, ['答']) }
    await runCmd(ask, ['ask', '你好'], ctx)
    expect(host.chatCalls).toHaveLength(0)
  })

  it('有管道输入时是一次性问答，不进入模式 —— 管道场景没有交互可言', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }, ['答']) }
    await runCmd(ask, ['ask'], ctx, '一段文本\n')
    expect(host.chatCalls).toHaveLength(0)
  })
})
