import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { renderStaticResume } from './renderStaticResume.ts'

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
 * 关掉 JS 时，<noscript> 里的 <style> 会被应用。用它把那份唯一的简历
 * 从 visually-hidden 还原成正常可见，而不是再注入第二份。
 *
 * 为什么不注入第二份：两份会带同一个 id，而 `#static-resume` 的裁剪规则
 * 对所有同 id 元素都生效 —— 禁用 JS 的用户两份都看不见，
 * noscript 这一半等于没做。同时还会产生重复的 JSON-LD。
 */
export const NOSCRIPT_REVEAL = `<noscript><style>
  #static-resume {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip-path: none;
    white-space: normal;
    padding: 1rem;
  }
  #root { display: none; }
</style></noscript>`

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
          .replace('<!--NOSCRIPT_RESUME-->', NOSCRIPT_REVEAL)
      },
    },
  }
}
