import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { renderStaticResume } from './renderStaticResume'

const CONTENT_DIR = 'src/content'

function collect(): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(join(dir, entry.name), `${prefix}${entry.name}/`); continue }
      if (!entry.name.endsWith('.md')) continue
      files[prefix + entry.name] = readFileSync(join(process.cwd(), dir, entry.name), 'utf8')
    }
  }
  walk(CONTENT_DIR, '')
  return files
}

/**
 * 构建时把静态简历注入 index.html。
 * 运行时渲染在这里是行不通的 —— 不执行 JS 的爬虫拿不到任何内容。
 */
export function staticResumePlugin(opts: { name: string; url?: string }): Plugin {
  return {
    name: 'static-resume',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const resume = renderStaticResume(collect(), opts)
        return html
          .replace('<!--STATIC_RESUME-->', resume)
          .replace('<!--NOSCRIPT_RESUME-->', `<noscript>${resume}</noscript>`)
      },
    },
  }
}
