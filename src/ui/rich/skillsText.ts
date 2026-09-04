export type SkillGroup = { name: string; items: { name: string; level: number }[] }

export const MAX_LEVEL = 5

/**
 * skills.json 是站点作者手改的内容文件，"level": 6 这样的笔误完全可预见。
 * node chunk 在 React 渲染阶段才求值，proc.run 的 try/catch 早已返回，内核的
 * 执行器兜不住这里的异常——一次越界的 level 就是白屏，而不是一条错误提示。
 * 所以每一处消费 level 的地方都必须先夹到 [0, MAX_LEVEL]。
 *
 * 这个文件本身是纯 TS、零 React 依赖：src/seo/renderStaticResume.ts（构建时
 * 在 Node 里跑的纯函数）需要跟 <SkillBars> 用同一份数据与同一套夹紧规则，
 * 但不能因此拖进 React —— 所以把这部分从 SkillBars.tsx 里拆出来单独放，
 * SkillBars.tsx 只是重新导出它们，不改动任何既有的导入路径。
 */
export function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_LEVEL, level))
}

export function skillsToText(groups: SkillGroup[]): string {
  return groups
    .map(g => `${g.name}\n` + g.items.map(i => `  ${i.name}  ${clampLevel(i.level)}/${MAX_LEVEL}`).join('\n'))
    .join('\n') + '\n'
}
