import { describe, it, expect } from 'vitest'
import { ask } from './ask'
import { makeTestCtx, runCmd, fakeAi, recordingHost, testHost } from '../testkit'
import type { AiStatus } from '../../core/ai/languageModel'
import type { Lang } from '../../core/process'

const FILES = {
  '/home/guest/about.md': '# 关于我\n\n全栈工程师，专注前端架构。\n',
  '/home/guest/skills.json': '{"groups":[{"name":"语言","items":[{"name":"TypeScript","level":5}]}]}\n',
  '/home/guest/projects/terminal-site.md': '# terminal-site\n\n从零实现的 shell。\n',
}

// 不覆盖 host.currentLang()，走的就是站点默认语言 en —— 下面这些用例断言的
// 是英文文案。中文那一份由文件末尾「ask 的文案跟随语言」那组显式钉住。
const ctxWith = (status: AiStatus, chunks: string[] = []) => {
  const ctx = makeTestCtx(FILES)
  const ai = fakeAi(status, chunks)
  return { ctx: { ...ctx, ai }, ai }
}

// 显式钉住语言。testHost.currentLang() 本来就返回站点默认语言 'en'，所以
// 「en 分支」用 ctxWith 也走得通 —— 但那样断言的期望值恰好等于回落值，
// 被测的查表逻辑整个删掉也不会红。要证明「文案跟着语言走」，两种语言都得显式给。
const langCtx = (l: Lang, status: AiStatus, chunks: string[] = []) => ({
  ...makeTestCtx(FILES),
  host: { ...testHost, currentLang: () => l },
  ai: fakeAi(status, chunks),
})

describe('ask —— 可用性判断', () => {
  // downloadable 不在这里：一次性问答场景下它现在会触发下载并继续作答，
  // 不再是「不调用模型、直接报错」的分支——见下面「downloadable 时触发下载」用例。
  //
  // 表里带 lang：文案拆成两份之后，只钉英文那份等于把中文那份的**内容**整个
  // 放空 —— 剩下的「非空 / 有汉字 / 与 en 不同」全是形状条件，中文四段换成
  // 「占位。」也照样绿。每种语言各自的关键词都得有人钉。
  const unavailableCases: [Lang, AiStatus, string][] = [
    ['en', { kind: 'unsupported' }, 'chrome://flags/#prompt-api-for-gemini-nano'],
    ['en', { kind: 'unavailable' }, 'VRAM'],
    ['en', { kind: 'downloading' }, 'still downloading'],
    ['zh', { kind: 'unsupported' }, 'chrome://flags/#prompt-api-for-gemini-nano'],
    ['zh', { kind: 'unavailable' }, '硬件'],
    ['zh', { kind: 'downloading' }, '正在下载'],
  ]

  for (const [l, status, expected] of unavailableCases) {
    it(`${l} 下 ${status.kind} 时不调用模型，给出针对性说明，退出码 1`, async () => {
      const ctx = langCtx(l, status)
      const r = await runCmd(ask, ['ask', '你好'], ctx)
      expect(r.code).toBe(1)
      expect(r.err).toContain(expected)
      expect(ctx.ai.created).toBe(0)
    })
  }

  // 隐私承诺是这段文案里最不能被静默删掉的一句，两种语言都得钉住：
  // 只钉英文的话，中文版把「不会发到任何服务器」删了，整套用例不会有任何反应。
  it('unsupported 的文案要说明模型跑在本地、不上传 —— 这是访客最先关心的', async () => {
    const en = await runCmd(ask, ['ask', '你好'], langCtx('en', { kind: 'unsupported' }))
    expect(en.err).toContain('runs on your own')
    expect(en.err).toContain('nothing is sent to a server')

    const zh = await runCmd(ask, ['ask', '你好'], langCtx('zh', { kind: 'unsupported' }))
    expect(zh.err).toContain('跑在你本地')
    expect(zh.err).toContain('问题不会发到任何服务器')
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
    expect(r.out).toContain('starting the download')
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
    expect(ai.systemPrompts[0]).toContain('say you do not know')
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
    expect(r.out).toContain('chat mode')
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
    expect(r.err).toContain('ask <question>')

    // 中文那份也要钉：这句是在告诉用户「怎么把它变成可用」，两种语言下
    // 都不能被静默删成一句「还没下载」。
    const zh = await runCmd(ask, ['ask'], langCtx('zh', { kind: 'downloadable' }))
    expect(zh.err).toContain('ask <问题>')
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

describe('ask 的文案跟随语言', () => {
  it('英文下 unsupported 文案是英文', async () => {
    const r = await runCmd(ask, ['ask', 'hi'], langCtx('en', { kind: 'unsupported' }))
    expect(r.err).toContain('chrome://flags')
    expect(r.err).toMatch(/[A-Za-z]{4,}/)
    expect(r.err).not.toMatch(/[一-龥]/)
  })

  it('中文下 unsupported 文案是中文', async () => {
    const r = await runCmd(ask, ['ask', 'hi'], langCtx('zh', { kind: 'unsupported' }))
    expect(r.err).toContain('chrome://flags')
    expect(r.err).toMatch(/[一-龥]/)
  })

  // 只有三种：downloadable 在一次性问答下会触发下载而不是报错，它的早退文案
  // 由下面那条单独覆盖。
  it('三种不可用状态在两种语言下都有文案，且两种语言互不相同', async () => {
    for (const kind of ['unsupported', 'unavailable', 'downloading'] as const) {
      const en = await runCmd(ask, ['ask', 'hi'], langCtx('en', { kind }))
      const zh = await runCmd(ask, ['ask', 'hi'], langCtx('zh', { kind }))
      expect(en.err.trim().length).toBeGreaterThan(0)
      expect(zh.err.trim().length).toBeGreaterThan(0)
      // 两种语言取到同一份文案，等于翻译表少了一半而测试还全绿。
      expect(en.err).not.toBe(zh.err)
    }
  })

  it('downloadable 的早退文案也跟着语言走', async () => {
    const en = await runCmd(ask, ['ask'], langCtx('en', { kind: 'downloadable' }))
    const zh = await runCmd(ask, ['ask'], langCtx('zh', { kind: 'downloadable' }))
    expect(en.err).not.toMatch(/[一-龥]/)
    expect(zh.err).toMatch(/[一-龥]/)
  })

  // 状态行和诊断段是两份独立的文案，分开断言 —— 合起来看「整段有没有汉字」时，
  // 只要有一份还是中文，另一份漏翻也照样绿。
  it('--status 的状态行与诊断都跟着语言走', async () => {
    const en = await runCmd(ask, ['ask', '--status'], langCtx('en', { kind: 'unsupported' }))
    const zh = await runCmd(ask, ['ask', '--status'], langCtx('zh', { kind: 'unsupported' }))
    const head = (s: string) => s.split('\n')[0]!
    const body = (s: string) => s.split('\n').slice(1).join('\n')

    expect(head(en.out)).toContain('unsupported')
    expect(head(en.out)).not.toMatch(/[一-龥]/)
    expect(head(zh.out)).toMatch(/[一-龥]/)

    expect(body(en.out)).toContain('chrome://flags')
    expect(body(en.out)).not.toMatch(/[一-龥]/)
    expect(body(zh.out)).toMatch(/[一-龥]/)
  })

  it('进入对话模式的引导跟着语言走 —— 英文站点上混一段中文引导就是 bug', async () => {
    const en = await runCmd(ask, ['ask'], langCtx('en', { kind: 'ready' }))
    const zh = await runCmd(ask, ['ask'], langCtx('zh', { kind: 'ready' }))
    expect(en.out).not.toMatch(/[一-龥]/)
    expect(zh.out).toMatch(/[一-龥]/)
    // 三种退出方式在哪种语言下都不能少。
    for (const out of [en.out, zh.out]) {
      expect(out).toContain('exit')
      expect(out).toContain('Ctrl+D')
      expect(out).toContain('Ctrl+C')
    }
  })

  it('触发下载的提示跟着语言走', async () => {
    const en = await runCmd(ask, ['ask', 'hi'], langCtx('en', { kind: 'downloadable' }, ['ok']))
    const zh = await runCmd(ask, ['ask', 'hi'], langCtx('zh', { kind: 'downloadable' }, ['ok']))
    // 形状（有没有汉字）和内容（那句话还在不在）都要钉：只判形状的话，
    // 中文那句换成任意一句中文都算过。
    expect(en.out).toContain('starting the download')
    expect(en.out).not.toMatch(/[一-龥]/)
    expect(zh.out).toContain('开始下载')
  })

  it('system prompt 要求模型用英文回答', async () => {
    const ctx = langCtx('en', { kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ctx.ai.systemPrompts[0]).toMatch(/English/i)
  })

  it('中文模式下 system prompt 要求用中文回答', async () => {
    const ctx = langCtx('zh', { kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ctx.ai.systemPrompts[0]).toMatch(/中文/)
  })

  it('进入对话模式带的 system prompt 也跟着语言走 —— 对话模式才是多轮问答的主场', async () => {
    const enter = async (l: Lang) => {
      const host = recordingHost()
      const ctx = { ...makeTestCtx(FILES), host: { ...host, currentLang: () => l }, ai: fakeAi({ kind: 'ready' }) }
      await runCmd(ask, ['ask'], ctx)
      return host.chatCalls[0]!.systemPrompt
    }
    expect(await enter('zh')).toMatch(/中文/)
    expect(await enter('en')).toMatch(/English/i)
  })

  // 只有管道输入、没带问题时，命令替用户补的那句问题进的是发给模型的 input，
  // 不是屏幕输出 —— 它照样得跟着语言走，否则英文站点上是拿中文指令去问模型。
  it('只有管道输入时替用户补的那句问题跟着语言走', async () => {
    const en = langCtx('en', { kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask'], en, '一段文本\n')
    expect(en.ai.prompts[0]).toContain('Summarize the text above.')

    const zh = langCtx('zh', { kind: 'ready' }, ['ok'])
    await runCmd(ask, ['ask'], zh, '一段文本\n')
    expect(zh.ai.prompts[0]).toContain('请总结上面的内容。')
  })

  it('两种语言的 system prompt 都带上同一份简历资料 —— 翻译的是人设不是内容', async () => {
    for (const l of ['en', 'zh'] as const) {
      const ctx = langCtx(l, { kind: 'ready' }, ['ok'])
      await runCmd(ask, ['ask', 'hi'], ctx)
      expect(ctx.ai.systemPrompts[0]).toContain('全栈工程师，专注前端架构')
    }
  })
})
