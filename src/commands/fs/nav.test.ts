import { describe, it, expect, beforeEach } from 'vitest'
import { ls } from './ls'
import { pwd } from './pwd'
import { cd } from './cd'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('pwd', () => {
  it('打印当前目录', async () => {
    expect((await runCmd(pwd, ['pwd'], ctx)).out).toBe('/home/guest\n')
  })
})

describe('cd', () => {
  it('无参数回到家目录', async () => {
    ctx.cwd = '/etc'
    await runCmd(cd, ['cd'], ctx)
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('进入相对目录', async () => {
    await runCmd(cd, ['cd', 'projects'], ctx)
    expect(ctx.cwd).toBe('/home/guest/projects')
  })

  it('.. 回到上级', async () => {
    ctx.cwd = '/home/guest/projects'
    await runCmd(cd, ['cd', '..'], ctx)
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('目标不存在时报错且不改变 cwd', async () => {
    const r = await runCmd(cd, ['cd', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('No such file or directory')
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('目标是文件时报 Not a directory', async () => {
    const r = await runCmd(cd, ['cd', 'about.md'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Not a directory')
  })

  it('cd - 回到上一个目录', async () => {
    await runCmd(cd, ['cd', 'projects'], ctx)
    await runCmd(cd, ['cd', '-'], ctx)
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('同步更新 PWD 环境变量', async () => {
    await runCmd(cd, ['cd', 'projects'], ctx)
    expect(ctx.env.get('PWD')).toBe('/home/guest/projects')
  })

  it('补全只提供目录', () => {
    expect(cd.complete!(['cd', ''], ctx)).toEqual(['projects/'])
  })
})

describe('ls', () => {
  it('一行一个条目，默认隐藏点文件', async () => {
    const r = await runCmd(ls, ['ls'], ctx)
    expect(r.out).toBe('about.md\napple.md\nprojects\n')
  })

  it('-a 显示隐藏文件', async () => {
    expect((await runCmd(ls, ['ls', '-a'], ctx)).out).toContain('.hidden')
  })

  it('接受目录参数', async () => {
    expect((await runCmd(ls, ['ls', 'projects'], ctx)).out).toBe('p.md\n')
  })

  it('目标是文件时打印该文件名', async () => {
    expect((await runCmd(ls, ['ls', 'apple.md'], ctx)).out).toBe('apple.md\n')
  })

  it('-l 输出权限、大小与名称', async () => {
    const r = await runCmd(ls, ['ls', '-l', 'apple.md'], ctx)
    expect(r.out).toMatch(/^-rw-r--r--\s+guest\s+6\s+.*apple\.md\n$/)
  })

  it('-l 下目录以 d 开头', async () => {
    expect((await runCmd(ls, ['ls', '-l', 'projects'], ctx)).out).toMatch(/^-rw|^d/)
  })

  it('目录名用蓝色加粗标记', async () => {
    const r = await runCmd(ls, ['ls'], ctx)
    expect(r.chunks.some(c => c.type === 'text' && c.text.startsWith('projects') && c.style?.bold)).toBe(true)
  })

  it('不存在的路径报错并返回 2', async () => {
    const r = await runCmd(ls, ['ls', 'nope'], ctx)
    expect(r.code).toBe(2)
    expect(r.err).toContain('No such file or directory')
  })

  it('未知选项返回 2', async () => {
    expect((await runCmd(ls, ['ls', '-z'], ctx)).code).toBe(2)
  })
})
