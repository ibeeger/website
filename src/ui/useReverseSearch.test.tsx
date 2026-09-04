// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReverseSearch } from './useReverseSearch'

const ENTRIES = ['ls -la', 'cat about.md', 'grep foo about.md', 'pwd']

describe('useReverseSearch', () => {
  it('初始未激活', () => {
    expect(renderHook(() => useReverseSearch(ENTRIES)).result.current.active).toBe(false)
  })

  it('start 后进入搜索态', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    expect(result.current.active).toBe(true)
  })

  it('从最新一条往回找到第一个包含子串的命令', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('about') })
    expect(result.current.match).toBe('grep foo about.md')
  })

  it('再按一次 Ctrl+R 跳到更旧的一条匹配', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('about') })
    act(() => { result.current.next() })
    expect(result.current.match).toBe('cat about.md')
  })

  it('没有更旧的匹配时停在最后一条', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('about') })
    act(() => { result.current.next() })
    act(() => { result.current.next() })
    expect(result.current.match).toBe('cat about.md')
  })

  it('无匹配时 match 为空', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('zzz') })
    expect(result.current.match).toBe('')
  })

  it('accept 返回当前匹配并退出搜索态', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('pwd') })
    let accepted = ''
    act(() => { accepted = result.current.accept() })
    expect(accepted).toBe('pwd')
    expect(result.current.active).toBe(false)
  })

  it('cancel 退出搜索态并清空查询', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('ls') })
    act(() => { result.current.cancel() })
    expect(result.current.active).toBe(false)
    expect(result.current.query).toBe('')
  })
})
