// @vitest-environment jsdom
import '../test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SkillBars, skillsToText, clampLevel, type SkillGroup } from './SkillBars'

// 站点作者手改 skills.json 时打错等级（超出 1-5 或负数）是完全可预见的输入。
// node chunk 是在 React 渲染阶段才求值的，proc.run 的 try/catch 早就返回了，
// 内核的执行器无法兜住这里抛出的异常 —— 一次 level 打错就是白屏，而不是一条错误提示。
const OUT_OF_RANGE_GROUPS: SkillGroup[] = [
  { name: '语言', items: [{ name: 'TypeScript', level: 6 }] },
  { name: '前端', items: [{ name: 'CSS', level: -1 }] },
]

describe('clampLevel', () => {
  it('把超出上限的等级夹到 5', () => {
    expect(clampLevel(6)).toBe(5)
  })

  it('把负数等级夹到 0', () => {
    expect(clampLevel(-1)).toBe(0)
  })

  it('范围内的等级原样返回', () => {
    expect(clampLevel(3)).toBe(3)
  })
})

describe('SkillBars 对越界 level 的容错', () => {
  it('渲染不抛出异常', () => {
    expect(() => render(<SkillBars groups={OUT_OF_RANGE_GROUPS} />)).not.toThrow()
  })

  it('skillsToText 按夹紧后的等级输出', () => {
    const text = skillsToText(OUT_OF_RANGE_GROUPS)
    expect(text).toContain('TypeScript  5/5')
    expect(text).toContain('CSS  0/5')
  })
})
