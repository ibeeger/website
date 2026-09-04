// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCompletion } from './useCompletion'

/**
 * 造一个假的 complete()：给定 { frag -> candidates } 的映射，模拟内核的契约——
 * candidates 是完整片段（含原有前缀），replaceFrom 是行内最后一个空白之后的位置。
 */
function fakeComplete(byFrag: Record<string, string[]>) {
  return (line: string) => {
    const m = /(\S*)$/.exec(line)
    const frag = m?.[1] ?? ''
    const replaceFrom = line.length - frag.length
    return { candidates: byFrag[frag] ?? [], replaceFrom }
  }
}

describe('useCompletion', () => {
  it('无候选时行不变，hint 为空', () => {
    const { result } = renderHook(() => useCompletion(fakeComplete({})))
    expect(result.current('ls x')).toEqual({ line: 'ls x', hint: [] })
  })

  it('唯一候选：补全并追加一个空格', () => {
    const complete = fakeComplete({ a: ['about.md'] })
    const { result } = renderHook(() => useCompletion(complete))
    expect(result.current('cat a')).toEqual({ line: 'cat about.md ', hint: [] })
  })

  it('唯一目录候选：补全并追加斜杠，不追加空格', () => {
    const complete = fakeComplete({ proj: ['projects/'] })
    const { result } = renderHook(() => useCompletion(complete))
    expect(result.current('cd proj')).toEqual({ line: 'cd projects/', hint: [] })
  })

  it('多候选且公共前缀长于片段：行推进到公共前缀，hint 列出全部候选', () => {
    // 'apple.md' 与 'application.py' 的公共前缀是 'appl'，长于片段 'ap'
    const complete = fakeComplete({ ap: ['apple.md', 'application.py'] })
    const { result } = renderHook(() => useCompletion(complete))
    expect(result.current('ls ap')).toEqual({
      line: 'ls appl',
      hint: ['apple.md', 'application.py'],
    })
  })

  it('多候选但公共前缀没能推进：行不变，hint 列出全部候选', () => {
    // 'apple.md' 与 'about.md' 的公共前缀就是 'a'，跟片段 'a' 一样长，推进不了
    const complete = fakeComplete({ a: ['apple.md', 'about.md'] })
    const { result } = renderHook(() => useCompletion(complete))
    expect(result.current('ls a')).toEqual({
      line: 'ls a',
      hint: ['apple.md', 'about.md'],
    })
  })

  it('replaceFrom 落在行中间时，其前的内容原样保留', () => {
    const complete = fakeComplete({ b: ['bar.txt'] })
    const { result } = renderHook(() => useCompletion(complete))
    expect(result.current('cp foo.txt b')).toEqual({ line: 'cp foo.txt bar.txt ', hint: [] })
  })
})
