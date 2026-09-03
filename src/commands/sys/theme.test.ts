import { describe, it, expect, beforeEach, vi } from 'vitest'
import { theme } from './theme'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('theme', () => {
  it('无参数时列出全部主题并标出当前项', async () => {
    const r = await runCmd(theme, ['theme'], ctx)
    expect(r.out).toContain('dracula')
    expect(r.out).toContain('*')          // 当前主题的标记
  })

  it('切换到已知主题', async () => {
    const spy = vi.spyOn(ctx.host, 'setTheme')
    const r = await runCmd(theme, ['theme', 'nord'], ctx)
    expect(r.code).toBe(0)
    expect(spy).toHaveBeenCalledWith('nord')
  })

  it('未知主题返回 1', async () => {
    const r = await runCmd(theme, ['theme', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('nope')
  })

  it('补全提供主题名', () => {
    expect(theme.complete!(['theme', 'n'], ctx)).toContain('nord')
  })
})
