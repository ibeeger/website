import { describe, it, expect } from 'vitest'
import { buildInitialVfs } from './bootstrap'

describe('buildInitialVfs', () => {
  it('按绝对路径放置文件', () => {
    const vfs = buildInitialVfs({ '/home/guest/about.md': 'hi' })
    expect(vfs.readFile('/home/guest/about.md')).toBe('hi')
  })

  it('自动创建中间目录', () => {
    const vfs = buildInitialVfs({ '/a/b/c/d.txt': 'x' })
    expect(vfs.isDir('/a/b/c')).toBe(true)
  })

  it('多个文件共享父目录', () => {
    const vfs = buildInitialVfs({
      '/home/guest/a.md': '1',
      '/home/guest/b.md': '2',
    })
    expect(vfs.list('/home/guest').map(i => i.name)).toEqual(['a.md', 'b.md'])
  })

  it('空输入产出只有根的树', () => {
    const vfs = buildInitialVfs({})
    expect(vfs.list('/')).toEqual([])
  })
})
