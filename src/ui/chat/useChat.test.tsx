// @vitest-environment jsdom
import '../test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChat } from './useChat'
import { fakeAi } from '../../commands/testkit'

describe('useChat', () => {
  it('初始不在模式内', () => {
    const { result } = renderHook(() => useChat(fakeAi({ kind: 'ready' })))
    expect(result.current.active).toBe(false)
  })

  it('enter() 进入模式', () => {
    const { result } = renderHook(() => useChat(fakeAi({ kind: 'ready' })))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    expect(result.current.active).toBe(true)
    expect(result.current.phase).toBe('idle')
  })

  it('send() 后产生一轮对话，最终拿到完整回答', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['我会 ', 'TypeScript'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('你会什么') })

    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.turns).toHaveLength(1)
    expect(result.current.turns[0]!.input).toBe('你会什么')
    expect(result.current.turns[0]!.text).toBe('我会 TypeScript')
  })

  it('同一个 session 服务多轮 —— 上下文才连得起来', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('第一问') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    act(() => { result.current.send('第二问') })
    await waitFor(() => expect(result.current.turns).toHaveLength(2))

    expect(ai.created).toBe(1)
    expect(ai.prompts).toEqual(['第一问', '第二问'])
  })

  it('leave() 退出模式并释放 session', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    await waitFor(() => expect(ai.created).toBe(1))
    act(() => { result.current.leave() })

    expect(result.current.active).toBe(false)
    expect(ai.destroyed).toBe(1)
  })

  it('模型抛异常时记在这一轮上，不踢出模式', async () => {
    const ai = fakeAi({ kind: 'ready' }, [], { throwOnPrompt: true })
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('hi') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    expect(result.current.active).toBe(true)
    expect(result.current.turns[0]!.error).toContain('模型炸了')
  })

  it('interrupt() 中断当前轮但留在模式内', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['a', 'b', 'c'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('hi') })
    act(() => { result.current.interrupt() })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    expect(result.current.active).toBe(true)
    expect(result.current.turns[0]!.interrupted).toBe(true)
  })

  it('inputs 记录模式内提交过的输入，退出后清空', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('第一问') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.inputs).toEqual(['第一问'])

    act(() => { result.current.leave() })
    expect(result.current.inputs).toEqual([])
  })

  it('生成中再次 send 被忽略 —— 单槽，与 shell 的重入守卫同理', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['a', 'b'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('第一问') })
    act(() => { result.current.send('第二问') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    expect(result.current.turns).toHaveLength(1)
  })

  it('leave() 在 session 还没 resolve 时也能释放 —— 走 promise.then 降级路径', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result } = renderHook(() => useChat(ai))
    // 中间不 await：leave() 落在 createSession() 的 promise 还没 resolve 的窗口内，
    // 逼出 disposeSession() 里 resolved 分支为空、退化到 pending.then(destroy) 的那条路径。
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.leave() })

    await waitFor(() => expect(ai.destroyed).toBe(1))
  })

  it('组件卸载时释放 session —— 不依赖调用方记得 leave()', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result, unmount } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    await waitFor(() => expect(ai.created).toBe(1))

    unmount()

    await waitFor(() => expect(ai.destroyed).toBe(1))
  })

  it('interrupt() 不依赖 provider 抛异常 —— provider 安静停止也能被 hook 自己识别为中断', async () => {
    // fakeAi 分片全靠 microtask 驱动，任何基于真实定时器轮询的 waitFor 都
    // 追不上——三片一口气全部消费完通常发生在下一次真实轮询之前，永远抓
    // 不到"已经吐出第一片、还没吐完"这个窗口。用 stepped 让分片之间插一个
    // 真实的宏任务边界，再用 vi 的 fake timer 精确推进，而不是碰运气式地
    // 等一段真实时间——这样才是确定性的，不看机器快慢脸色。
    const ai = fakeAi({ kind: 'ready' }, ['a', 'b', 'c'], { silentAbort: true, stepped: true })
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    await waitFor(() => expect(ai.created).toBe(1))

    vi.useFakeTimers()
    try {
      act(() => { result.current.send('hi') })
      // 推进到刚好吐出第一片：这一步之前，第二片的宏任务边界还没到，
      // interrupt() 正好能落在"已经在生成、还没生成完"的真正中途。
      await act(async () => { await vi.advanceTimersByTimeAsync(15) })
      expect(result.current.phase).toBe('streaming')
      expect(result.current.turns[0]!.text).toBe('a')

      act(() => { result.current.interrupt() })
      // 第二片的宏任务边界这时候才到：provider 检查 signal 时已经是
      // aborted，silentAbort 让它安静 return，不抛异常。
      await act(async () => { await vi.advanceTimersByTimeAsync(15) })
    } finally {
      vi.useRealTimers()
    }

    expect(result.current.active).toBe(true)
    expect(result.current.turns[0]!.interrupted).toBe(true)
    // 第二片 'b' 不该被追加进来——中断发生在它的宏任务边界之后、消费之前，
    // 循环体自己的 signal 检查（而不是 provider 抛异常）拦下了它。
    expect(result.current.turns[0]!.text).toBe('a')
  })

  it('会话创建期间就被 interrupt()，不该再向 provider 补发一次生成请求', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['a', 'b'])
    const { result } = renderHook(() => useChat(ai))
    // 三次 act() 背靠背：send() 的 await pending 这时还没机会 resolve，
    // interrupt() 抢在会话就绪之前先把 signal 标成 aborted。
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('hi') })
    act(() => { result.current.interrupt() })

    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.turns[0]!.interrupted).toBe(true)
    expect(ai.prompts).toEqual([])
  })

  it('createSession() reject 时不产生 unhandled rejection，leave() 仍能干净退出', async () => {
    const ai = fakeAi({ kind: 'ready' }, [], { rejectSession: true })
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    await waitFor(() => expect(ai.created).toBe(1))

    act(() => { result.current.leave() })
    expect(result.current.active).toBe(false)
  })

  it('连续两次 enter()，第一个 session 的 resolve 落在第二次 enter() 之后也不会互相踩踏 —— 对应 C2 与缓存代次守卫', async () => {
    // deferSessions：手动控制两个 session 的 resolve 顺序，精确复现评审
    // 给出的原始时序——enter() → enter() → 让 s0 resolve → leave() →
    // 让 s1 resolve。不用 deferSessions 的话，fakeAi 的 createSession()
    // 本来就同步 resolve，两次 enter() 之间不会有任何间隔去分别观察
    // "只有 s0 resolve、s1 还没 resolve"这个中间状态。
    const ai = fakeAi({ kind: 'ready' }, ['答'], { deferSessions: true })
    const { result } = renderHook(() => useChat(ai))

    act(() => { result.current.enter({ systemPrompt: 's1' }) })
    act(() => { result.current.enter({ systemPrompt: 's2' }) })
    expect(ai.created).toBe(2)

    // 只放行第一个 session：第二个此刻仍然是待定的 promise。
    await act(async () => { ai.resolveSession(0) })
    await waitFor(() => expect(ai.destroyed).toBe(1))

    act(() => { result.current.leave() })

    // 第一个 session 已经在上一步被 destroy 过了；这里放行第二个，
    // 它必须被自己的 promise.then(destroy) 兜底，而不是被落下。
    await act(async () => { ai.resolveSession(1) })
    await waitFor(() => expect(ai.destroyed).toBe(2))

    // 两次 destroy 必须落在两个不同的 session 上：不能是同一个 session 被
    // destroy 两次（缓存代次守卫要防的 bug——旧 session 的缓存写入若没有
    // 代次守卫，会在 leave() 时把已经 destroy 过的旧 session 当成"当前
    // session"再 destroy 一次，而真正的新 session 则被整个漏掉），
    // 也不能漏掉其中一个。
    expect(ai.destroyedSessionIds).toEqual([1, 2])
  })
})
