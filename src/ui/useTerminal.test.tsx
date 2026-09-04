// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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
vi.mock('../core/ai/languageModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/ai/languageModel')>()
  const { fakeAi } = await import('../commands/testkit')
  const shared = fakeAi({ kind: 'ready' }, ['答', '案'])
  return { ...actual, createBrowserAi: () => shared }
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
    await waitFor(() => expect(outputOf(result.current.blocks)).toContain('关于我'))
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
})
