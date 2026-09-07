export type SkillGroup = { name: string; items: { name: string; level: number }[] }

export const MAX_LEVEL = 5

/**
 * skills.json 是站点作者手改的内容文件，"level": 6 这样的笔误完全可预见。
 * 坏数据的第一道拦截在命令层的 readSkillGroups（skills.tsx）：形状不对就
 * stderr + 退出码 1，是一次看得见、管道也接得住的失败。
 *
 * 但越界的 level 仍是个合法 number，过得了那道形状校验，剩下的只有取值问题。
 * 而 node chunk 在 React 渲染阶段才求值，proc.run 的 try/catch 早已返回，这里
 * 真抛出去只会被 OutputBlock 的 ErrorBoundary 兜成一行标红的降级文本——没有
 * 退出码、没有 stderr，作者根本看不出自己写错了。所以这里不抛，改成夹到
 * [0, MAX_LEVEL]：渲染保持全函数，越界的后果止步于画到边界值。
 * 每一处消费 level 的地方都必须先过这个夹紧。
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
