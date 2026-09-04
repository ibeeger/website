// @vitest-environment jsdom
import '../test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect } from 'vitest'
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
})
