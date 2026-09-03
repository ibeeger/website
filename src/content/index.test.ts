import { describe, it, expect } from 'vitest'
import { loadContent } from './index'

describe('loadContent', () => {
  it('包含 about.md 与项目文件', () => {
    const files = loadContent()
    expect(files['/home/guest/about.md']).toContain('关于我')
    expect(files['/home/guest/projects/terminal-site.md']).toContain('terminal-site')
    expect(files['/etc/motd']).toContain('Welcome')
  })
})
