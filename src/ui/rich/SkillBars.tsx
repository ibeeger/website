export type SkillGroup = { name: string; items: { name: string; level: number }[] }

const MAX_LEVEL = 5

export function skillsToText(groups: SkillGroup[]): string {
  return groups
    .map(g => `${g.name}\n` + g.items.map(i => `  ${i.name}  ${i.level}/${MAX_LEVEL}`).join('\n'))
    .join('\n') + '\n'
}

export function SkillBars({ groups }: { groups: SkillGroup[] }) {
  const width = Math.max(...groups.flatMap(g => g.items.map(i => i.name.length)), 0)
  return (
    <div className="skills">
      {groups.map(g => (
        <div key={g.name} className="skill-group">
          <div className="skill-group-name">{g.name}</div>
          {g.items.map(item => (
            <div key={item.name} className="skill-row">
              <span className="skill-name">{item.name.padEnd(width)}</span>
              <span
                className="skill-bar"
                role="img"
                aria-label={`${item.name} ${item.level} / ${MAX_LEVEL}`}
              >
                {'█'.repeat(item.level)}
                <span className="skill-bar-empty">{'░'.repeat(MAX_LEVEL - item.level)}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
