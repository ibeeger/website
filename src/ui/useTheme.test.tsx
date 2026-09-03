// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'
import { THEMES } from './themes'

beforeEach(() => { localStorage.clear() })

describe('useTheme', () => {
  it('默认使用 tokyo-night', () => {
    expect(renderHook(() => useTheme()).result.current.theme).toBe('tokyo-night')
  })

  it('切换后把变量写到根元素', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setTheme('gruvbox') })
    expect(document.documentElement.style.getPropertyValue('--bg'))
      .toBe(THEMES['gruvbox']!['--bg'])
  })

  it('选择持久化到 localStorage', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setTheme('nord') })
    expect(localStorage.getItem('terminal-theme')).toBe('nord')
  })

  it('启动时读回已保存的主题', () => {
    localStorage.setItem('terminal-theme', 'nord')
    expect(renderHook(() => useTheme()).result.current.theme).toBe('nord')
  })

  it('忽略无效的主题名', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setTheme('不存在的主题') })
    expect(result.current.theme).toBe('tokyo-night')
  })

  it('每个主题都定义了全部必需变量', () => {
    const required = Object.keys(THEMES['tokyo-night']!)
    for (const [name, vars] of Object.entries(THEMES)) {
      expect(Object.keys(vars).sort(), `主题 ${name} 变量不全`).toEqual(required.sort())
    }
  })
})
