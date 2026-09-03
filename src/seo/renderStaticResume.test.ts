import { describe, it, expect } from 'vitest'
import { renderStaticResume } from './renderStaticResume'

const FILES = {
  'about.md': '# 关于我\n\n一名工程师。\n',
  'contact.md': '# 联系方式\n\n- GitHub: https://github.com/example\n',
  'projects/alpha.md': '# alpha\n\n第一个项目。\n',
}

const html = () => renderStaticResume(FILES, { name: '张三', url: 'https://example.com' })

describe('renderStaticResume', () => {
  it('输出语义化标题：唯一的 h1 是姓名，内容标题降一级', () => {
    const out = html()
    const h1s = out.match(/<h1>/g) ?? []
    expect(h1s).toHaveLength(1)
    expect(out).toContain('<h1>张三</h1>')
    expect(out).toContain('<h2>关于我</h2>')
  })

  it('包含项目内容', () => {
    expect(html()).toContain('alpha')
    expect(html()).toContain('第一个项目')
  })

  it('把裸 URL 变成可跟随的链接', () => {
    expect(html()).toContain('href="https://github.com/example"')
  })

  it('内嵌 JSON-LD 的 Person 结构化数据', () => {
    const out = html()
    expect(out).toContain('application/ld+json')
    expect(out).toContain('"@type": "Person"')
    expect(out).toContain('张三')
  })

  it('转义 HTML 特殊字符，防止内容注入标记', () => {
    const out = renderStaticResume({ 'about.md': '# <script>alert(1)</script>\n' }, { name: 'x' })
    expect(out).not.toContain('<script>alert(1)</script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('缺少某个文件时不抛异常', () => {
    expect(() => renderStaticResume({}, { name: 'x' })).not.toThrow()
  })

  it('不含任何 React 产物', () => {
    expect(html()).not.toContain('data-reactroot')
  })
})
