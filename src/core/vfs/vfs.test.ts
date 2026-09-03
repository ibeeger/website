import { describe, it, expect, beforeEach } from 'vitest'
import { createVfs, emptyDir, VfsError, type VfsErrorCode, type VFS } from './vfs'

/**
 * 断言抛出的是带指定 code 的 VfsError。
 * 不用 toThrowError(expect.objectContaining(...)) —— 非对称匹配器在 toThrow 上的
 * 支持随版本而变，显式写更稳。
 */
function expectVfsError(fn: () => unknown, code: VfsErrorCode) {
  let thrown: unknown
  try { fn() } catch (e) { thrown = e }
  expect(thrown, `期望抛出 VfsError(${code})，但没有抛出`).toBeInstanceOf(VfsError)
  expect((thrown as VfsError).code).toBe(code)
}

let vfs: VFS

beforeEach(() => {
  vfs = createVfs(emptyDir('/', 1000), () => 2000)
  vfs.mkdir('/home/guest', true)
  vfs.writeFile('/home/guest/about.md', 'hello')
})

describe('resolve', () => {
  it('相对路径按 cwd 解析', () => {
    expect(vfs.resolve('/home/guest', 'about.md')).toBe('/home/guest/about.md')
  })

  it('绝对路径忽略 cwd', () => {
    expect(vfs.resolve('/home/guest', '/etc')).toBe('/etc')
  })
})

describe('stat / isDir', () => {
  it('文件存在时返回 file inode', () => {
    expect(vfs.stat('/home/guest/about.md')?.kind).toBe('file')
  })

  it('不存在时返回 null', () => {
    expect(vfs.stat('/nope')).toBeNull()
  })

  it('根始终是目录', () => {
    expect(vfs.isDir('/')).toBe(true)
  })

  it('路径中间段是文件时 isDir 返回 false 而不是抛异常', () => {
    expect(vfs.isDir('/home/guest/about.md/nope')).toBe(false)
  })

  it('路径中间段是文件时 stat 返回 null', () => {
    expect(vfs.stat('/home/guest/about.md/nope')).toBeNull()
  })
})

describe('readFile', () => {
  it('读回写入的内容', () => {
    expect(vfs.readFile('/home/guest/about.md')).toBe('hello')
  })

  it('文件不存在抛 ENOENT', () => {
    expectVfsError(() => vfs.readFile('/nope'), 'ENOENT')
  })

  it('读目录抛 EISDIR', () => {
    expectVfsError(() => vfs.readFile('/home'), 'EISDIR')
  })
})

describe('writeFile', () => {
  it('覆盖已有文件并更新 mtime', () => {
    vfs.writeFile('/home/guest/about.md', 'new')
    const st = vfs.stat('/home/guest/about.md')
    expect(st).toMatchObject({ kind: 'file', content: 'new', mtime: 2000 })
  })

  it('父目录不存在抛 ENOENT', () => {
    expectVfsError(() => vfs.writeFile('/no/such/f.txt', 'x'), 'ENOENT')
  })

  it('目标是目录时抛 EISDIR', () => {
    expectVfsError(() => vfs.writeFile('/home', 'x'), 'EISDIR')
  })
})

describe('appendFile', () => {
  it('追加到已有内容之后', () => {
    vfs.appendFile('/home/guest/about.md', ' world')
    expect(vfs.readFile('/home/guest/about.md')).toBe('hello world')
  })

  it('文件不存在时创建', () => {
    vfs.appendFile('/home/guest/new.txt', 'x')
    expect(vfs.readFile('/home/guest/new.txt')).toBe('x')
  })
})

describe('list', () => {
  it('按名称字典序返回子节点', () => {
    vfs.writeFile('/home/guest/z.md', '')
    vfs.writeFile('/home/guest/a.md', '')
    expect(vfs.list('/home/guest').map(i => i.name)).toEqual(['a.md', 'about.md', 'z.md'])
  })

  it('列出文件抛 ENOTDIR', () => {
    expectVfsError(() => vfs.list('/home/guest/about.md'), 'ENOTDIR')
  })

  it('列出不存在的路径抛 ENOENT', () => {
    expectVfsError(() => vfs.list('/nope'), 'ENOENT')
  })
})

describe('mkdir', () => {
  it('recursive 时创建多级目录', () => {
    vfs.mkdir('/a/b/c', true)
    expect(vfs.isDir('/a/b/c')).toBe(true)
  })

  it('非 recursive 且父目录缺失时抛 ENOENT', () => {
    expectVfsError(() => vfs.mkdir('/a/b/c', false), 'ENOENT')
  })

  it('目标已存在时抛 EEXIST', () => {
    expectVfsError(() => vfs.mkdir('/home', false), 'EEXIST')
  })

  it('recursive 时目标已存在不报错', () => {
    expect(() => vfs.mkdir('/home', true)).not.toThrow()
  })
})

describe('remove', () => {
  it('删除文件', () => {
    vfs.remove('/home/guest/about.md', false)
    expect(vfs.stat('/home/guest/about.md')).toBeNull()
  })

  it('非 recursive 删除非空目录抛 ENOTEMPTY', () => {
    expectVfsError(() => vfs.remove('/home/guest', false), 'ENOTEMPTY')
  })

  it('recursive 时删除整棵子树', () => {
    vfs.remove('/home', true)
    expect(vfs.stat('/home')).toBeNull()
  })

  it('拒绝删除根，抛 EPERM', () => {
    expectVfsError(() => vfs.remove('/', true), 'EPERM')
  })

  it('删除不存在的路径抛 ENOENT', () => {
    expectVfsError(() => vfs.remove('/nope', false), 'ENOENT')
  })
})

describe('touch', () => {
  it('不存在则创建空文件', () => {
    vfs.touch('/home/guest/t.txt')
    expect(vfs.readFile('/home/guest/t.txt')).toBe('')
  })

  it('已存在则只更新 mtime，不清空内容', () => {
    vfs.touch('/home/guest/about.md')
    expect(vfs.readFile('/home/guest/about.md')).toBe('hello')
    expect(vfs.stat('/home/guest/about.md')?.mtime).toBe(2000)
  })
})

describe('VfsError', () => {
  it('携带 code 与 path', () => {
    const e = new VfsError('ENOENT', '/x')
    expect(e.code).toBe('ENOENT')
    expect(e.path).toBe('/x')
    expect(e).toBeInstanceOf(Error)
  })
})
