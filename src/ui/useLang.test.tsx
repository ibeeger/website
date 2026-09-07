// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLang } from './useLang'
import { LANG_STORAGE_KEY } from '../i18n/lang'

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('lang') })
afterEach(() => { vi.restoreAllMocks() })

describe('useLang', () => {
  it('默认英文 —— 不做浏览器语言嗅探，同一个 URL 对谁都一样', () => {
    const { result } = renderHook(() => useLang())
    expect(result.current.lang).toBe('en')
  })

  it('读取已保存的选择', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'zh')
    expect(renderHook(() => useLang()).result.current.lang).toBe('zh')
  })

  it('保存的值不合法时回落默认 —— localStorage 是用户可改的', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'klingon')
    expect(renderHook(() => useLang()).result.current.lang).toBe('en')
  })

  it('localStorage 抛异常时回落默认 —— 隐私模式下 getItem 会直接抛', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(renderHook(() => useLang()).result.current.lang).toBe('en')
  })

  it('setLang 写入 localStorage', () => {
    const { result } = renderHook(() => useLang())
    act(() => { result.current.setLang('zh') })
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('zh')
  })

  it('写入失败不影响切换 —— 存不下也不该让功能失效', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const { result } = renderHook(() => useLang())
    act(() => { result.current.setLang('zh') })
    expect(result.current.lang).toBe('zh')
  })

  it('同步 document.documentElement.lang —— 读屏软件据此切换发音', () => {
    const { result } = renderHook(() => useLang())
    expect(document.documentElement.lang).toBe('en')
    act(() => { result.current.setLang('zh') })
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('非法语言被忽略', () => {
    const { result } = renderHook(() => useLang())
    act(() => { (result.current.setLang as (l: string) => void)('klingon') })
    expect(result.current.lang).toBe('en')
  })
})
