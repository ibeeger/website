// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTerminal } from './useTerminal'
import { chunkToText } from '../core/process'

const outputOf = (blocks: { chunks: unknown[] }[]) =>
  blocks.flatMap(b => b.chunks).map(c => chunkToText(c as never)).join('')

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
})
