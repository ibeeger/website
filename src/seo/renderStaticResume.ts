import { clampLevel, MAX_LEVEL, type SkillGroup } from '../ui/rich/skillsText.ts'

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

/**
 * 极简 Markdown → HTML。只处理标题、无序列表、段落。
 *
 * 标题整体降一级（# → h2，## → h3，### → h4）：整份简历只应该有一个 h1
 * ——姓名，由 renderStaticResume 单独输出。每个内容文件自己的标题只是
 * 章节标题，不该跟文档标题抢 h1。
 */
function mdToHtml(source: string): string {
  const out: string[] = []
  let inList = false

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('### ')) { closeList(); out.push(`<h4>${linkify(escapeHtml(line.slice(4)))}</h4>`); continue }
    if (line.startsWith('## ')) { closeList(); out.push(`<h3>${linkify(escapeHtml(line.slice(3)))}</h3>`); continue }
    if (line.startsWith('# ')) { closeList(); out.push(`<h2>${linkify(escapeHtml(line.slice(2)))}</h2>`); continue }
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
  skills: SkillGroup[],
  opts: { name: string; url?: string },
): string {
  // 整份文档只有一个 h1——姓名。内容文件自己的标题在 mdToHtml 里已经降了一级，
  // 不会再跟这个 h1 竞争。
  const sections: string[] = [`<h1>${escapeHtml(opts.name)}</h1>`]

  if (files['about.md']) sections.push(mdToHtml(files['about.md']))

  // 爬虫与关闭 JS 的用户拿到的是这份静态简历，而不是 in-terminal 的 resume
  // 命令——两者必须包含同一批小节。之前这里漏了技能，静态版本反而比
  // 终端里能打出来的版本更「瘦」，跟「让作者更容易被搜到」的目标正相反。
  // 用跟 skillsToText 相同的数据源与夹紧规则（clampLevel），保证口径一致。
  if (skills.length > 0) {
    sections.push('<h2>技能</h2>')
    for (const g of skills) {
      sections.push(`<h3>${escapeHtml(g.name)}</h3>`)
      sections.push('<ul>')
      for (const item of g.items) {
        sections.push(`<li>${escapeHtml(item.name)}  ${clampLevel(item.level)}/${MAX_LEVEL}</li>`)
      }
      sections.push('</ul>')
    }
  }

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
