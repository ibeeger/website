// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistory } from './useHistory'

describe('useHistory', () => {
  it('↑ 从最新一条开始倒着走', () => {
    const { result } = renderHook(() => useHistory(['a', 'b', 'c']))
    act(() => { expect(result.current.prev('')).toBe('c') })
    act(() => { expect(result.current.prev('')).toBe('b') })
  })

  it('走到最旧一条后停住', () => {
    const { result } = renderHook(() => useHistory(['a']))
    act(() => { result.current.prev('') })
    act(() => { expect(result.current.prev('')).toBe('a') })
  })

  it('↓ 走回来，走过头时恢复为未提交的草稿', () => {
    const { result } = renderHook(() => useHistory(['a', 'b']))
    act(() => { result.current.prev('draft') })
    act(() => { expect(result.current.next()).toBe('draft') })
  })

  it('历史为空时 ↑ 返回原值', () => {
    const { result } = renderHook(() => useHistory([]))
    act(() => { expect(result.current.prev('typed')).toBe('typed') })
  })

  // 换语言会整个重建内核，kernel.ctx.history 会换成另一个数组。游标只在挂载时
  // 求值的话，它还指着旧数组的长度 —— 换完之后第一次按 ↑ 会取到越界的下标、
  // 什么都不发生。这条用例盯的就是那个接缝。
  it('历史数组被换掉后，↑ 从新数组的末尾开始', () => {
    const { result, rerender } = renderHook(
      ({ entries }) => useHistory(entries),
      { initialProps: { entries: ['a', 'b', 'c'] } },
    )
    act(() => { expect(result.current.prev('')).toBe('c') })

    rerender({ entries: ['x'] })
    act(() => { expect(result.current.prev('')).toBe('x') })
  })

  it('reset 后重新从最新一条开始', () => {
    const { result } = renderHook(() => useHistory(['a', 'b']))
    act(() => { result.current.prev('') })
    act(() => { result.current.reset() })
    act(() => { expect(result.current.prev('')).toBe('b') })
  })
})
