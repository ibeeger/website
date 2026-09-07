import { describe, it, expect } from 'vitest'
import { loadContent } from './index'

describe('loadContent', () => {
  it('包含 about.md 与项目文件', () => {
    const files = loadContent('zh')
    expect(files['/home/guest/about.md']).toContain('关于我')
    expect(files['/home/guest/projects/terminal-site.md']).toContain('terminal-site')
    expect(files['/etc/motd']).toContain('Welcome')
  })
})

describe('loadContent(lang)', () => {
  it('英文与中文各自返回完整的文件树', () => {
    for (const lang of ['en', 'zh'] as const) {
      const files = loadContent(lang)
      expect(files['/home/guest/about.md']).toBeTruthy()
      expect(files['/home/guest/contact.md']).toBeTruthy()
      expect(files['/home/guest/skills.json']).toBeTruthy()
      expect(files['/home/guest/projects/terminal-site.md']).toBeTruthy()
    }
  })

  it('两种语言的正文确实不同 —— 不是同一份内容换了个壳', () => {
    expect(loadContent('en')['/home/guest/about.md'])
      .not.toBe(loadContent('zh')['/home/guest/about.md'])
  })

  it('skills.json 也跟着语言走 —— 不止是内容不同，标签也没配反', () => {
    // 只断言「不相等」防不住 en/zh 被整体调换：两份内容依旧不同，但标签是反的。
    // 用分组名这个语言特征词，确认返给 en 的确实是英文分组、zh 的确实是中文分组。
    expect(loadContent('en')['/home/guest/skills.json']).toContain('Languages')
    expect(loadContent('zh')['/home/guest/skills.json']).toContain('语言')
  })

  it('语言目录名不出现在 VFS 路径里 —— ls 应当看到 about.md 而不是 en/about.md', () => {
    const paths = Object.keys(loadContent('en'))
    expect(paths.some(p => p.includes('/en/') || p.includes('/zh/'))).toBe(false)
  })

  it('motd 跟着语言走', () => {
    expect(loadContent('en')['/etc/motd']).not.toBe(loadContent('zh')['/etc/motd'])
  })

  it('语言无关的系统文件两种语言下一致', () => {
    expect(loadContent('en')['/etc/passwd']).toBe(loadContent('zh')['/etc/passwd'])
    expect(loadContent('en')['/proc/version']).toBe(loadContent('zh')['/proc/version'])
  })
})
