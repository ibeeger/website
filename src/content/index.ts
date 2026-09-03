import { systemFiles } from './system'
import skills from './skills.json'

const HOME = '/home/guest'

/** Vite 构建时把 Markdown 内容内联为字符串。此文件是 core 与 Vite 之间的唯一接缝。 */
const markdown = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function loadContent(): Record<string, string> {
  const files: Record<string, string> = { ...systemFiles }
  for (const [rel, content] of Object.entries(markdown)) {
    // './projects/x.md' -> '/home/guest/projects/x.md'
    files[HOME + rel.slice(1)] = content
  }
  files[`${HOME}/skills.json`] = JSON.stringify(skills, null, 2) + '\n'
  return files
}

export { skills }
