// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { useTerminal } from './useTerminal'
import { chunkToText, type Process } from '../core/process'

const outputOf = (blocks: { chunks: unknown[] }[]) =>
  blocks.flatMap(b => b.chunks).map(c => chunkToText(c as never)).join('')

// 一条可控的「挂起」命令：只在收到 abort 信号时才结束（退出码 130，约定俗成的
// SIGINT 退出码），此外永不自行结束。用它而不是真实命令 + 计时器来触发重入场景，
// 这样测试的通过与否不依赖时序竞争。
vi.mock('../commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../commands')>()
  const pending: Process = {
    name: 'pending',
    description: 'test-only：仅在被 abort 时结束',
    async run(_io, ctx) {
      return new Promise<number>(resolve => {
        if (ctx.signal.aborted) { resolve(130); return }
        ctx.signal.addEventListener('abort', () => resolve(130), { once: true })
      })
    },
  }
  return { ...actual, builtins: [...actual.builtins, pending] }
})

// createKernel 的一层薄包装：除了给 'force-reject' 这一行命令强制 reject，
// 其余全部转发给真正的内核。用它来确定性地触发 kernel.run 的意外 reject ——
// 真实命令路径（executor/kernel 的 try/catch）已经把这类情况兜住了，没有
// 天然的办法从命令层面制造一个逃逸的 reject，所以在内核构造这一层拦截。
vi.mock('../core/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/kernel')>()
  return {
    ...actual,
    createKernel(opts: Parameters<typeof actual.createKernel>[0]) {
      const real = actual.createKernel(opts)
      return {
        ctx: real.ctx,
        prompt: () => real.prompt(),
        complete: (line: string) => real.complete(line),
        run(line: string, out: Parameters<typeof real.run>[1], signal: AbortSignal) {
          if (line === 'force-reject') return Promise.reject(new Error('boom'))
          return real.run(line, out, signal)
        },
      }
    },
  }
})

// 对话模式要一个「就绪」的模型：jsdom 里没有 LanguageModel 全局，真实
// createBrowserAi() 永远返回 unsupported，ask 会走诊断分支、根本进不了模式。
// 换掉的是浏览器而不是被测代码。刻意返回同一个实例：useTerminal 把它同时交给
// kernel（命令查可用性）和 useChat（模式里真正提问），两边必须是同一个 provider。
// 默认返回同一个就绪的实例；两个开关分别用来制造「模型提问就炸」和「第二次
// 取 provider 会拿到另一个（不可用的）实例」这两种场景，用完在 afterEach 复位。
// 开关必须在 renderHook 之前设置：provider 是 useTerminal 挂载时一次性取定的
// （useState 惰性初始化），挂载之后再改，这次挂载读不到，用例会静默失效。
const aiCtl = vi.hoisted(() => ({
  throwOnPrompt: false, onlyFirstReady: false, calls: 0,
  // 那个「就绪」的 fake 实例本身，用来断言 session 真的被释放了。它是模块级
  // 单例、被所有用例共用，destroyed 会跨用例累加，所以断言必须看增量。
  ready: null as import('../commands/testkit').FakeAi | null,
}))

vi.mock('../core/ai/languageModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/ai/languageModel')>()
  const { fakeAi } = await import('../commands/testkit')
  const ready = fakeAi({ kind: 'ready' }, ['答', '案'])
  aiCtl.ready = ready
  const failing = fakeAi({ kind: 'ready' }, [], { throwOnPrompt: true })
  return {
    ...actual,
    createBrowserAi: () => {
      if (aiCtl.onlyFirstReady && ++aiCtl.calls > 1) return fakeAi({ kind: 'unsupported' })
      return aiCtl.throwOnPrompt ? failing : ready
    },
  }
})

afterEach(() => {
  aiCtl.throwOnPrompt = false
  aiCtl.onlyFirstReady = false
  aiCtl.calls = 0
  // useLang 把选择持久化了，jsdom 的 localStorage 在同一个文件里跨用例存活 ——
  // 不清掉的话，切过语言的用例会让它后面所有用例都从中文起步。
  localStorage.clear()
})

describe('useTerminal', () => {
  it('初始没有任何 block', () => {
    const { result } = renderHook(() => useTerminal())
    expect(result.current.blocks).toEqual([])
  })

  it('提交命令后产生一个 block 并带上输出', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo hello') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(1))
    await waitFor(() => expect(outputOf(result.current.blocks)).toBe('hello\n'))
  })

  it('block 记录提交时刻的提示符与原始输入', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo hi') })
    await waitFor(() => expect(result.current.blocks[0]!.input).toBe('echo hi'))
    expect(result.current.blocks[0]!.prompt).toContain('guest@terminal')
  })

  it('命令结束后写回退出码', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('nosuchcmd') })
    await waitFor(() => expect(result.current.blocks[0]!.exitCode).toBe(127))
  })

  it('running 在命令执行期间为真，结束后为假', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo x') })
    await waitFor(() => expect(result.current.running).toBe(false))
    expect(result.current.blocks[0]!.exitCode).toBe(0)
  })

  it('clear 命令清空全部 block', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo a') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(1))
    act(() => { result.current.submit('clear') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(0))
  })

  it('提示符随 cd 更新', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('cd projects') })
    await waitFor(() => expect(result.current.prompt).toContain('~/projects'))
  })

  it('空输入也产生一个 block（保留视觉上的空行）', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(1))
  })

  it('内容来自真实的 content 目录', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('cat about.md') })
    await waitFor(() => expect(outputOf(result.current.blocks)).toContain('About'))
  })

  it('complete 代理到内核', () => {
    const { result } = renderHook(() => useTerminal())
    expect(result.current.complete('ech').candidates).toContain('echo')
  })

  it('第一条命令还在跑时，重入的 submit 被挡住；interrupt 仍能中断第一条命令', async () => {
    const { result } = renderHook(() => useTerminal())

    act(() => { result.current.submit('pending') })
    await waitFor(() => expect(result.current.running).toBe(true))
    expect(result.current.blocks).toHaveLength(1)

    // 重入：第一条命令还没结束。没有守卫的话这里会多出第二个 block，
    // 并且 abortRef 会被第二条命令的 controller 覆盖。
    act(() => { result.current.submit('echo should-be-ignored') })
    expect(result.current.blocks).toHaveLength(1)

    // interrupt() 必须仍然作用在第一条命令上 —— 如果 abortRef 被重入的
    // submit 覆盖掉了，这里 abort 的会是第二条（从未真正开始的）命令，
    // 第一条命令的退出码永远不会被写回。
    act(() => { result.current.interrupt() })
    await waitFor(() => expect(result.current.blocks[0]!.exitCode).toBe(130))
    expect(result.current.running).toBe(false)
    expect(result.current.blocks).toHaveLength(1)
  })

  it('kernel.run 意外 reject 时，会话仍能恢复，不会被永久锁死', async () => {
    const { result } = renderHook(() => useTerminal())

    act(() => { result.current.submit('force-reject') })
    await waitFor(() => expect(result.current.blocks[0]!.exitCode).not.toBeNull())
    expect(result.current.running).toBe(false)

    // 关键断言：守卫（abortRef）必须已被释放，否则下面这次 submit 会被永久挡住。
    act(() => { result.current.submit('echo recovered') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(2))
    await waitFor(() => expect(outputOf([result.current.blocks[1]!])).toBe('recovered\n'))
  })
})

describe('useTerminal 语言切换', () => {
  // 一条命令跑完（退出码写回）才算完 —— lang 的重建是在 run 里触发的，
  // 不等它落地就提交下一条，测的就不再是「重建之后」了。
  const runLine = async (
    result: { current: ReturnType<typeof useTerminal> },
    line: string,
    n: number,
  ) => {
    act(() => { result.current.submit(line) })
    await waitFor(() => {
      expect(result.current.blocks).toHaveLength(n)
      expect(result.current.blocks[n - 1]!.exitCode).not.toBeNull()
    })
    return outputOf([result.current.blocks[n - 1]!])
  }

  it('切换语言后 VFS 内容真的变了 —— 不是只改了个标记位', async () => {
    const { result } = renderHook(() => useTerminal())
    const english = await runLine(result, 'cat about.md', 1)

    await runLine(result, 'lang zh', 2)
    const chinese = await runLine(result, 'cat about.md', 3)

    expect(chinese).not.toBe(english)
    expect(chinese.length).toBeGreaterThan(0)
  })

  it('切换语言后 skills 的技能表跟着变 —— 它读 VFS，不是直接 import 英文那份', async () => {
    const { result } = renderHook(() => useTerminal())
    expect(await runLine(result, 'skills', 1)).toContain('Languages')

    await runLine(result, 'lang zh', 2)
    const chinese = await runLine(result, 'skills', 3)
    expect(chinese).toContain('语言')
    expect(chinese).not.toContain('Languages')
  })

  it('切换语言后 resume 里的技能段落跟着变', async () => {
    const { result } = renderHook(() => useTerminal())
    expect(await runLine(result, 'resume', 1)).toContain('Languages')

    await runLine(result, 'lang zh', 2)
    const chinese = await runLine(result, 'resume', 3)
    expect(chinese).toContain('语言')
    expect(chinese).not.toContain('Languages')
  })

  it('lang 无参数时标记当前语言，切换后标记跟着走', async () => {
    const { result } = renderHook(() => useTerminal())
    expect(await runLine(result, 'lang', 1)).toMatch(/\*\s*en/)

    await runLine(result, 'lang zh', 2)
    expect(await runLine(result, 'lang', 3)).toMatch(/\*\s*zh/)
  })

  // 内核换了，提示符不跟着换的话，输入行会一直显示旧内核的 cwd ——
  // 那个目录在新文件树里可能根本不存在。
  it('切换语言后提示符回到新内核的 cwd', async () => {
    const { result } = renderHook(() => useTerminal())
    await runLine(result, 'cd projects', 1)
    expect(result.current.prompt).toContain('~/projects')

    await runLine(result, 'lang zh', 2)
    expect(result.current.prompt).not.toContain('~/projects')
    expect(result.current.prompt).toContain('~')
  })

  it('切换后 history 换成新数组 —— 重建的内核不共用旧会话的历史', async () => {
    const { result } = renderHook(() => useTerminal())
    await runLine(result, 'echo a', 1)
    const before = result.current.history
    expect(before).toContain('echo a')

    await runLine(result, 'lang zh', 2)
    expect(result.current.history).not.toBe(before)
    expect(result.current.history).not.toContain('echo a')
  })
})

describe('useTerminal 对话模式', () => {
  // 每条用例都从「ask 进入模式」起步：这是唯一的入口，也顺带盯住 host.enterChat
  // 这条链路（命令 → Host → hooksBox → useChat）没有在某一环断掉。
  const enterChat = async (result: { current: ReturnType<typeof useTerminal> }) => {
    act(() => { result.current.submit('ask') })
    await waitFor(() => expect(result.current.chatActive).toBe(true))
  }

  it('ask 进入对话模式后提示符变成 ask> ', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    expect(result.current.prompt).toBe('ask> ')
  })

  it('模式内提交不走 kernel —— 输入发给模型而不是解析成命令', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    act(() => { result.current.submit('ls') })
    await waitFor(() => {
      const last = result.current.blocks[result.current.blocks.length - 1]!
      expect(last.kind).toBe('chat')
    })
    const last = result.current.blocks[result.current.blocks.length - 1]!
    // 走 kernel 的话这里会是 ls 的目录列表；是模型的回答才说明分流生效了。
    await waitFor(() => expect(outputOf([result.current.blocks[result.current.blocks.length - 1]!])).toBe('答案'))
    expect(last.input).toBe('ls')
    expect(last.prompt).toBe('ask> ')
  })

  it('模式内输入 exit 退出，提示符恢复', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    act(() => { result.current.submit('exit') })
    await waitFor(() => expect(result.current.chatActive).toBe(false))
    expect(result.current.prompt).not.toBe('ask> ')
    expect(result.current.prompt).toContain('guest@terminal')
  })

  it('空闲时 interrupt 退出模式', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    act(() => { result.current.interrupt() })
    await waitFor(() => expect(result.current.chatActive).toBe(false))
  })

  it('生成中 interrupt 停本轮但留在模式内', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    // 两次 act 之间不会冲刷 microtask，所以 interrupt() 稳定地落在这一轮
    // 生成还没结束的窗口里，不靠时序赌运气。
    act(() => { result.current.submit('你好') })
    act(() => { result.current.interrupt() })
    await waitFor(() => {
      const last = result.current.blocks[result.current.blocks.length - 1]!
      expect(last.interrupted).toBe(true)
    })
    expect(result.current.chatActive).toBe(true)
  })

  it('生成中 leaveChat 无条件退出模式并释放 session —— Ctrl+D 不走 Ctrl+C 那条按 phase 的分流', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    const destroyedBefore = aiCtl.ready!.destroyed

    // 两次 act 之间不会冲刷 microtask，所以这一刻这一轮确实还没生成完 ——
    // 正是 interrupt() 会选择「只停这一轮」的那个窗口。
    act(() => { result.current.submit('你好') })
    expect(result.current.blocks[result.current.blocks.length - 1]!.phase).toBe('thinking')

    act(() => { result.current.leaveChat() })

    await waitFor(() => expect(result.current.chatActive).toBe(false))
    // 退出必定释放 session：模型常驻显存，不放就是泄漏。
    expect(aiCtl.ready!.destroyed).toBe(destroyedBefore + 1)
  })

  it('模式内的输入不进 shell 历史', async () => {
    const { result } = renderHook(() => useTerminal())
    const before = result.current.history.length
    await enterChat(result)
    act(() => { result.current.submit('你好') })
    // 只有 'ask' 这一条进了 shell 历史，'你好' 没有
    expect(result.current.history.length).toBe(before + 1)
    expect(result.current.history).not.toContain('你好')
  })

  it('模式内的输入进 chatInputs', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    act(() => { result.current.submit('你好') })
    await waitFor(() => expect(result.current.chatInputs).toEqual(['你好']))
  })

  it('退出模式时把还在生成的 block 定格 —— 思考指示器不会永远转下去', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    act(() => { result.current.submit('你好') })
    const pendingBlock = result.current.blocks[result.current.blocks.length - 1]!
    expect(pendingBlock.phase).toBe('thinking')
    // 还没有文本就不该有 chunk —— 空 chunk 会让 OutputBlock 多渲染一个空输出区。
    expect(pendingBlock.chunks).toEqual([])
    // 生成中直接 exit：turns 被清空，那一轮的收尾 patch 再也到不了这个 block。
    act(() => { result.current.submit('exit') })
    await waitFor(() => expect(result.current.chatActive).toBe(false))
    const frozen = result.current.blocks.find(b => b.id === pendingBlock.id)!
    expect(frozen.phase).toBe('idle')
    expect(frozen.interrupted).toBe(true)
  })

  it('退出模式后普通命令照常执行 —— 分流没有把重入守卫按在按下状态', async () => {
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    act(() => { result.current.submit('exit') })
    await waitFor(() => expect(result.current.chatActive).toBe(false))
    act(() => { result.current.submit('echo recovered') })
    await waitFor(() => expect(outputOf(result.current.blocks)).toContain('recovered\n'))
  })
  it('模型报错时错误落在那一轮的 block 上', async () => {
    aiCtl.throwOnPrompt = true
    const { result } = renderHook(() => useTerminal())
    await enterChat(result)
    act(() => { result.current.submit('你好') })
    await waitFor(() => {
      const last = result.current.blocks[result.current.blocks.length - 1]!
      expect(last.error).toBe('模型炸了')
    })
    // 报错不该把人踢出模式：换个问法还能接着问。
    expect(result.current.chatActive).toBe(true)
  })

  it('内核与对话模式共用同一个 provider —— 命令查到的可用性就是模式用的那一个', async () => {
    // 第二次取 provider 会拿到一个 unsupported 的实例。useTerminal 若不把自己
    // 那个实例传给 createKernel（让内核自己再造一个），ask 就会查到 unsupported、
    // 打诊断而不进模式 —— 于是这条 waitFor 会超时。
    aiCtl.onlyFirstReady = true
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('ask') })
    await waitFor(() => expect(result.current.chatActive).toBe(true))
  })
})

describe('useTerminal 对话模式的 scrollback 投影', () => {
  // 这一组整体跑在 StrictMode 下：生产的 main.tsx 就是 StrictMode，而这里的投影
  // 逻辑把「这条 turn 第一次见到吗」的判定和 ref 写入放在 setBlocks 的更新函数
  // 外面，靠的正是「更新函数必须纯净」这条约束。不在 StrictMode 下跑的话，把那次
  // 写入挪回更新函数里（一个看起来纯属收拢的重构）会让对话在生产里完全不显示，
  // 而普通渲染下的用例一条都不会红。
  const mount = () => renderHook(() => useTerminal(), { wrapper: StrictMode })

  const enterChat = async (result: { current: ReturnType<typeof useTerminal> }) => {
    act(() => { result.current.submit('ask') })
    await waitFor(() => expect(result.current.chatActive).toBe(true))
  }
  const chatBlocks = (result: { current: ReturnType<typeof useTerminal> }) =>
    result.current.blocks.filter(b => b.kind === 'chat')
  // 一轮问答彻底结束（phase 落回 idle）才算完，不能只等文本出现：useChat 的
  // 单槽守卫要在收尾之后才放行下一次 send()。
  const settle = async (result: { current: ReturnType<typeof useTerminal> }, n: number) => {
    await waitFor(() => {
      const cb = chatBlocks(result)
      expect(cb).toHaveLength(n)
      expect(cb[n - 1]!.phase).toBe('idle')
      expect(outputOf([cb[n - 1]!])).toBe('答案')
    })
  }

  it('一轮问答只留下一个 chat block —— 流式分片是就地更新，不是不断追加', async () => {
    const { result } = mount()
    await enterChat(result)
    act(() => { result.current.submit('你好') })
    await settle(result, 1)
    // 分片有两个（'答'、'案'）。若每个分片都往 scrollback 追加一条，这里会是 3。
    expect(chatBlocks(result)).toHaveLength(1)
  })

  it('同一会话连问两轮，两个 chat block 按提问顺序各占一条', async () => {
    const { result } = mount()
    await enterChat(result)
    act(() => { result.current.submit('第一问') })
    await settle(result, 1)
    act(() => { result.current.submit('第二问') })
    await settle(result, 2)
    expect(chatBlocks(result).map(b => b.input)).toEqual(['第一问', '第二问'])
  })

  it('退出后再次 ask，上一段对话仍在 scrollback 里且不被新会话覆盖', async () => {
    const { result } = mount()
    await enterChat(result)
    act(() => { result.current.submit('第一问') })
    await settle(result, 1)
    act(() => { result.current.submit('exit') })
    await waitFor(() => expect(result.current.chatActive).toBe(false))

    await enterChat(result)
    act(() => { result.current.submit('第二问') })
    await settle(result, 2)
    // 新会话的 turn id 若从 t0 重新开始，第二问会就地覆盖第一问那个 block，
    // 这里就只剩一条 —— useChat 的 idRef 跨会话单调递增是这条断言的前提。
    expect(chatBlocks(result).map(b => b.input)).toEqual(['第一问', '第二问'])
  })

  it('模式内清屏后再提问，被清掉的对话不会复活', async () => {
    const { result } = mount()
    await enterChat(result)
    act(() => { result.current.submit('第一问') })
    await settle(result, 1)

    // Ctrl+L：PromptLine 今天不感知模式，模式内清屏是一个按键的距离。
    act(() => { result.current.clearScreen() })
    expect(result.current.blocks).toEqual([])

    act(() => { result.current.submit('第二问') })
    await settle(result, 1)
    // 「blocks 里找不到」既可能是新 turn，也可能是被有意移除的 turn。混为一谈的话，
    // 下一个分片就会把清掉的第一问重新 push 回队尾。
    expect(chatBlocks(result).map(b => b.input)).toEqual(['第二问'])
    expect(result.current.blocks.map(b => b.input)).toEqual(['第二问'])
  })
})
