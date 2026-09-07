import { systemFiles } from './system'
import enSkills from './en/skills.json'
import zhSkills from './zh/skills.json'
import type { Lang } from '../core/process'

const HOME = '/home/guest'

/** Vite 构建时把 Markdown 内容内联为字符串。此文件是 core 与 Vite 之间的唯一接缝。 */
const markdown = import.meta.glob('./*/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const SKILLS: Record<Lang, unknown> = { en: enSkills, zh: zhSkills }

export function loadContent(lang: Lang): Record<string, string> {
  const files: Record<string, string> = { ...systemFiles(lang) }
  const prefix = `./${lang}/`
  for (const [rel, content] of Object.entries(markdown)) {
    if (!rel.startsWith(prefix)) continue
    // './en/projects/x.md' -> '/home/guest/projects/x.md'
    // 语言目录名不进 VFS 路径：访客该看到 about.md，而不是 en/about.md。
    files[HOME + '/' + rel.slice(prefix.length)] = content
  }
  files[`${HOME}/skills.json`] = JSON.stringify(SKILLS[lang], null, 2) + '\n'
  return files
}

export { enSkills, zhSkills }
