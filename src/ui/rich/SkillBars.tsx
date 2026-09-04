// clampLevel / skillsToText / MAX_LEVEL 挪去了 skillsText.ts（纯 TS，零 React
// 依赖），好让构建时在 Node 里跑的 renderStaticResume 也能用同一份数据、
// 同一套夹紧规则，而不必把 React 拖进它的依赖图。这里原样重新导出，
// 不改动任何既有导入路径（resume.tsx / skills.tsx / SkillBars.test.tsx
// 都还从 './SkillBars' 导入）。
import { clampLevel, MAX_LEVEL, type SkillGroup } from './skillsText'
export { clampLevel, skillsToText, MAX_LEVEL, type SkillGroup } from './skillsText'

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
