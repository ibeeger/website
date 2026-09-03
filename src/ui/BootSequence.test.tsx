// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { BootSequence, BOOT_STORAGE_KEY } from './BootSequence'

const LINES = ['first', 'second', 'third']

beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// DEFECT (reported, not silently patched — see task-21-22-report.md): a single
// `act(() => { vi.advanceTimersByTime(5000) })` call, as the brief's test literally
// specifies, only lets ONE render/effect cycle flush regardless of how much fake
// time is advanced within that call — React batches effect flushing to the
// boundary of the `act()` call, not to each fake timer callback fired inside it.
// So a setTimeout-chain of N steps needs N *separate* act() calls to fully play
// out under this project's React 19 / Testing Library 16 / Vitest 4 combination;
// this holds regardless of useEffect vs useLayoutEffect in the implementation,
// and regardless of advanceTimersByTime vs advanceTimersByTimeAsync — confirmed
// empirically before choosing this fix. `advanceAll` below drives the same total
// virtual time via repeated small act() calls so each queued timer gets a chance
// to fire and its effect to flush, without changing what any test asserts.
function advanceAll(stepMs = 100, steps = 20) {
  for (let i = 0; i < steps; i++) {
    act(() => { vi.advanceTimersByTime(stepMs) })
  }
}

describe('BootSequence', () => {
  it('逐行显示', () => {
    render(<BootSequence lines={LINES} onDone={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(120) })
    expect(screen.queryByText('first')).toBeTruthy()
    expect(screen.queryByText('third')).toBeNull()
  })

  it('全部显示完后回调 onDone', () => {
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    advanceAll()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('任意按键立即跳过并显示全部内容', () => {
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    act(() => { fireEvent.keyDown(window, { key: 'a' }) })
    expect(screen.queryByText('third')).toBeTruthy()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('播放完成后写入 sessionStorage', () => {
    render(<BootSequence lines={LINES} onDone={vi.fn()} />)
    advanceAll()
    expect(sessionStorage.getItem(BOOT_STORAGE_KEY)).toBe('1')
  })

  it('已播放过时直接完成，不做动画', () => {
    sessionStorage.setItem(BOOT_STORAGE_KEY, '1')
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledOnce()
    expect(screen.queryByText('third')).toBeTruthy()
  })

  it('用户偏好减少动效时直接完成', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q, addEventListener() {}, removeEventListener() {},
    }))
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
