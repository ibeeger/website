import type { ReactNode } from 'react'

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)/g

/** 把一行文本里的 Markdown 链接与裸 URL 渲染成可点击元素。 */
function inline(source: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  LINK_RE.lastIndex = 0

  while ((m = LINK_RE.exec(source)) !== null) {
    if (m.index > last) out.push(source.slice(last, m.index))
    const label = m[1] ?? m[3]!
    const href = m[2] ?? m[3]!
    out.push(
      <a key={`${keyPrefix}-${m.index}`} href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < source.length) out.push(source.slice(last))
  return out
}

/**
 * 极简 Markdown 渲染：标题、无序列表、段落、行内链接。
 * 刻意不支持表格、图片、嵌套列表 —— 简历内容用不到。
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n')
  return (
    <div className="md">
      {lines.map((line, i) => {
        const key = `l${i}`
        if (line.startsWith('### ')) return <div key={key} className="md-h3">{inline(line.slice(4), key)}</div>
        if (line.startsWith('## ')) return <div key={key} className="md-h2">{inline(line.slice(3), key)}</div>
        if (line.startsWith('# ')) return <div key={key} className="md-h1">{inline(line.slice(2), key)}</div>
        if (/^[-*] /.test(line)) return <div key={key} className="md-li">• {inline(line.slice(2), key)}</div>
        if (line.trim() === '') return <div key={key} className="md-blank"> </div>
        return <div key={key}>{inline(line, key)}</div>
      })}
    </div>
  )
}
