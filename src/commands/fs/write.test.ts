import { describe, it, expect, beforeEach } from 'vitest'
import { tree } from './tree'
import { find } from './find'
import { touch } from './touch'
import { mkdir } from './mkdir'
import { rm } from './rm'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('tree', () => {
  it('用制表符画出目录树', async () => {
    const r = await runCmd(tree, ['tree'], ctx)
    expect(r.out).toBe(
      '.\n' +
      '├── about.md\n' +
      '├── apple.md\n' +
      '└── projects\n' +
      '    └── p.md\n' +
      '\n1 directory, 3 files\n',
    )
  })

  it('接受目录参数', async () => {
    expect((await runCmd(tree, ['tree', 'projects'], ctx)).out).toContain('└── p.md')
  })

  it('默认不显示隐藏文件', async () => {
    expect((await runCmd(tree, ['tree'], ctx)).out).not.toContain('.hidden')
  })
})

describe('find', () => {
  it('无条件时递归列出全部路径', async () => {
    const r = await runCmd(find, ['find'], ctx)
    expect(r.out).toContain('./about.md')
    expect(r.out).toContain('./projects/p.md')
  })

  it('-name 按 glob 过滤', async () => {
    const r = await runCmd(find, ['find', '.', '-name', '*.md'], ctx)
    expect(r.out).toContain('./about.md')
    expect(r.out).not.toContain('./projects\n')
  })

  it('起点不存在时返回 1', async () => {
    expect((await runCmd(find, ['find', 'nope'], ctx)).code).toBe(1)
  })

  it('起点为根目录时不产生双斜杠', async () => {
    const r = await runCmd(find, ['find', '/'], ctx)
    expect(r.out).toContain('/home/guest/about.md')
    expect(r.out).not.toContain('//')
  })

  it('起点带尾斜杠时不产生双斜杠', async () => {
    const r = await runCmd(find, ['find', 'projects/'], ctx)
    expect(r.out).toContain('projects/p.md')
    expect(r.out).not.toContain('//')
  })
})

describe('touch', () => {
  it('创建空文件', async () => {
    await runCmd(touch, ['touch', 'new.txt'], ctx)
    expect(ctx.vfs.readFile('/home/guest/new.txt')).toBe('')
  })

  it('已存在的文件内容不变', async () => {
    await runCmd(touch, ['touch', 'apple.md'], ctx)
    expect(ctx.vfs.readFile('/home/guest/apple.md')).toBe('apple\n')
  })

  it('无参数返回 2', async () => {
    expect((await runCmd(touch, ['touch'], ctx)).code).toBe(2)
  })
})

describe('mkdir', () => {
  it('创建目录', async () => {
    await runCmd(mkdir, ['mkdir', 'newdir'], ctx)
    expect(ctx.vfs.isDir('/home/guest/newdir')).toBe(true)
  })

  it('-p 创建多级目录', async () => {
    await runCmd(mkdir, ['mkdir', '-p', 'a/b/c'], ctx)
    expect(ctx.vfs.isDir('/home/guest/a/b/c')).toBe(true)
  })

  it('已存在时报错', async () => {
    const r = await runCmd(mkdir, ['mkdir', 'projects'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('File exists')
  })

  it('-p 时已存在不报错', async () => {
    expect((await runCmd(mkdir, ['mkdir', '-p', 'projects'], ctx)).code).toBe(0)
  })
})

describe('rm', () => {
  it('删除文件', async () => {
    await runCmd(rm, ['rm', 'apple.md'], ctx)
    expect(ctx.vfs.stat('/home/guest/apple.md')).toBeNull()
  })

  it('删除非空目录需要 -r', async () => {
    const r = await runCmd(rm, ['rm', 'projects'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Is a directory')
  })

  it('-r 删除整棵子树', async () => {
    await runCmd(rm, ['rm', '-r', 'projects'], ctx)
    expect(ctx.vfs.stat('/home/guest/projects')).toBeNull()
  })

  it('文件不存在时报错', async () => {
    expect((await runCmd(rm, ['rm', 'nope'], ctx)).code).toBe(1)
  })

  it('-f 让不存在的文件静默通过', async () => {
    const r = await runCmd(rm, ['rm', '-f', 'nope'], ctx)
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
  })

  it('rm -rf / 是彩蛋，不真的删除', async () => {
    const r = await runCmd(rm, ['rm', '-rf', '/'], ctx)
    expect(r.code).toBe(1)
    expect(r.out).toContain('nice try')
    expect(ctx.vfs.isDir('/home/guest')).toBe(true)
  })
})
