import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IndexHtmlTransformContext } from 'vite'
import { staticResumePlugin, NOSCRIPT_REVEAL } from './vite-plugin-static-resume'

/** 从 global.css 里摘出 #static-resume 规则声明的每一个属性名。 */
function staticResumeHidingProps(): string[] {
  const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8')
  const rule = css.match(/#static-resume\s*\{([^}]*)\}/)
  if (!rule) throw new Error('global.css 里找不到 #static-resume 规则，测试基准丢失')
  const body = rule[1]
  if (body === undefined) throw new Error('#static-resume 规则解析失败')
  return Array.from(body.matchAll(/([a-z-]+)\s*:/g)).map(m => m[1]!)
}

const CTX: IndexHtmlTransformContext = { path: '/', filename: 'index.html' }

/** transformIndexHtml 声明为对象或函数的联合类型；本插件恒用 { order, handler } 形态。 */
function runHandler(html: string): string {
  const hook = staticResumePlugin({ name: 'x' }).transformIndexHtml
  if (typeof hook !== 'object' || hook === null || !('handler' in hook)) {
    throw new Error('transformIndexHtml 不是预期的 { handler } 形态')
  }
  const call = hook.handler as (html: string, ctx: IndexHtmlTransformContext) => string
  return call(html, CTX)
}

describe('staticResumePlugin', () => {
  it('NOSCRIPT_REVEAL 覆盖了 #static-resume 隐藏规则声明的每一个属性', () => {
    const props = staticResumeHidingProps()
    expect(props.length).toBeGreaterThan(0)
    for (const prop of props) {
      expect(NOSCRIPT_REVEAL).toMatch(new RegExp(`${prop}\\s*:`))
    }
  })

  it('两个占位注释都被替换掉，不留痕迹', () => {
    const out = runHandler('<!--STATIC_RESUME--><!--NOSCRIPT_RESUME-->')
    expect(out).not.toContain('<!--STATIC_RESUME-->')
    expect(out).not.toContain('<!--NOSCRIPT_RESUME-->')
  })

  it('只注入一份简历、一份 JSON-LD —— 钉住重复注入的回归', () => {
    const out = runHandler('<!--STATIC_RESUME--><!--NOSCRIPT_RESUME-->')
    expect(out.match(/id="static-resume"/g) ?? []).toHaveLength(1)
    expect(out.match(/application\/ld\+json/g) ?? []).toHaveLength(1)
  })
})
