// @vitest-environment jsdom
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
