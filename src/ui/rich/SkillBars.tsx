export type SkillGroup = { name: string; items: { name: string; level: number }[] }

const MAX_LEVEL = 5

/**
 * skills.json 是站点作者手改的内容文件，"level": 6 这样的笔误完全可预见。
 * node chunk 在 React 渲染阶段才求值，proc.run 的 try/catch 早已返回，内核的
 * 执行器兜不住这里的异常——一次越界的 level 就是白屏，而不是一条错误提示。
 * 所以两处消费 level 的地方都必须先夹到 [0, MAX_LEVEL]。
 */
export function clampLevel(level: number): number {
  return Math.max(0, Math.min(MAX_LEVEL, level))
}

export function skillsToText(groups: SkillGroup[]): string {
  return groups
    .map(g => `${g.name}\n` + g.items.map(i => `  ${i.name}  ${clampLevel(i.level)}/${MAX_LEVEL}`).join('\n'))
    .join('\n') + '\n'
}

export function SkillBars({ groups }: { groups: SkillGroup[] }) {
  const width = Math.max(...groups.flatMap(g => g.items.map(i => i.name.length)), 0)
  return (
    <div className="skills">
      {groups.map(g => (
        <div key={g.name} className="skill-group">
          <div className="skill-group-name">{g.name}</div>
          {g.items.map(item => {
            const lvl = clampLevel(item.level)
            return (
              <div key={item.name} className="skill-row">
                <span className="skill-name">{item.name.padEnd(width)}</span>
                <span
                  className="skill-bar"
                  role="img"
                  aria-label={`${item.name} ${lvl} / ${MAX_LEVEL}`}
                >
                  {'█'.repeat(lvl)}
                  <span className="skill-bar-empty">{'░'.repeat(MAX_LEVEL - lvl)}</span>
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
