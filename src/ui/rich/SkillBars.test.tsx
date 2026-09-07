// @vitest-environment jsdom
import '../test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SkillBars, skillsToText, clampLevel, type SkillGroup } from './SkillBars'

// 站点作者手改 skills.json 时打错等级（超出 1-5 或负数）是完全可预见的输入。
// 越界的 level 仍是合法 number，过得了 readSkillGroups 那道形状校验——形状不对
// 时也只有 skills 命令会给 stderr + 退出码 1，resume 那边是 `?? []` 宽容降级。
// 而 node chunk 是在 React 渲染阶段才求值的，proc.run 的
// try/catch 早就返回了，这里真抛出去只会被 OutputBlock 的 ErrorBoundary 兜成一行
// 标红的降级文本，没有退出码也没有 stderr。所以这些输入必须被夹住，
// 而不是指望异常把问题喊出来。
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
