export type Project = {
  name: string
  summary: string
  meta: { label: string; value: string }[]
}

/** 从一个项目 Markdown 文件解析出结构化数据。 */
export function parseProject(source: string, fallbackName: string): Project {
  const lines = source.split('\n')
  const heading = lines.find(l => l.startsWith('# '))
  const meta = lines
    .filter(l => /^[-*] /.test(l))
    .map(l => {
      const body = l.slice(2)
      // 整行就是一个裸 URL 时不能按冒号切：search 找的是第一个冒号，
      // 也就是 `https:` 里的那个，会切出 { label:'https', value:'//...' }，
      // 于是既不再匹配 isUrl（渲染成死文本），toText 也吐出被切坏的串。
      if (/^https?:\/\//.test(body)) return { label: '', value: body }
      const sep = body.search(/[:：]/)
      return sep < 0
        ? { label: '', value: body }
        : { label: body.slice(0, sep).trim(), value: body.slice(sep + 1).trim() }
    })
  const summary = lines.find(l => l.trim() !== '' && !l.startsWith('#') && !/^[-*] /.test(l)) ?? ''
  return { name: heading ? heading.slice(2).trim() : fallbackName, summary: summary.trim(), meta }
}

export function projectToText(p: Project): string {
  const metaLine = p.meta.map(m => (m.label ? `${m.label}: ${m.value}` : m.value)).join('  ')
  return `${p.name}\n  ${p.summary}\n  ${metaLine}\n`
}

const isUrl = (s: string) => /^https?:\/\//.test(s)

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="project-card">
      <div className="project-name">{project.name}</div>
      <div className="project-summary">{project.summary}</div>
      <div className="project-meta">
        {project.meta.map((m, i) => (
          <span key={i} className="project-meta-item">
            {m.label && <span className="project-meta-label">{m.label}: </span>}
            {isUrl(m.value)
              ? <a href={m.value} target="_blank" rel="noopener noreferrer">{m.value}</a>
              : m.value}
          </span>
        ))}
      </div>
    </div>
  )
}
