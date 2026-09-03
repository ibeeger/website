const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ESCAPES[ch]!)
}

const URL_RE = /(https?:\/\/[^\s<]+)/g

/** 先转义再链接化 —— 顺序反了就等于开了一个注入口子。 */
function linkify(escaped: string): string {
  return escaped.replace(URL_RE, url => `<a href="${url}">${url}</a>`)
}

/** 极简 Markdown → HTML。只处理标题、无序列表、段落。 */
function mdToHtml(source: string): string {
  const out: string[] = []
  let inList = false

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('### ')) { closeList(); out.push(`<h3>${linkify(escapeHtml(line.slice(4)))}</h3>`); continue }
    if (line.startsWith('## ')) { closeList(); out.push(`<h2>${linkify(escapeHtml(line.slice(3)))}</h2>`); continue }
    if (line.startsWith('# ')) { closeList(); out.push(`<h1>${linkify(escapeHtml(line.slice(2)))}</h1>`); continue }
    if (/^[-*] /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${linkify(escapeHtml(line.slice(2)))}</li>`)
      continue
    }
    closeList()
    if (line.trim() !== '') out.push(`<p>${linkify(escapeHtml(line))}</p>`)
  }
  closeList()
  return out.join('\n')
}

/**
 * 由内容文件生成一份完整的语义化简历 HTML。
 * 纯函数，无 React、无 DOM —— 它在构建时于 Node 中运行。
 */
export function renderStaticResume(
  files: Record<string, string>,
  opts: { name: string; url?: string },
): string {
  const sections: string[] = []

  if (files['about.md']) sections.push(mdToHtml(files['about.md']))

  const projectKeys = Object.keys(files)
    .filter(k => k.startsWith('projects/') && k.endsWith('.md'))
    .sort()
  if (projectKeys.length > 0) {
    sections.push('<h2>项目</h2>')
    for (const k of projectKeys) sections.push(mdToHtml(files[k]!))
  }

  if (files['contact.md']) sections.push(mdToHtml(files['contact.md']))

  const jsonLd = JSON.stringify(
    { '@context': 'https://schema.org', '@type': 'Person', name: opts.name, url: opts.url },
    null,
    2,
  )

  return [
    '<section id="static-resume">',
    sections.join('\n'),
    '</section>',
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join('\n')
}
