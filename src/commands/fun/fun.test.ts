import { describe, it, expect, beforeEach } from 'vitest'
import { sudo } from './sudo'
import { cowsay } from './cowsay'
import { neofetch } from './neofetch'
import { fortune } from './fortune'
import { exit } from './exit'
import { rm } from '../fs/rm'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx, Process } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

const ALL: Process[] = [sudo, cowsay, neofetch, fortune, exit]

describe('彩蛋通则', () => {
  it('全部标记为 hidden，不出现在 help 中', () => {
    for (const p of ALL) expect(p.hidden, `${p.name} 未标记 hidden`).toBe(true)
  })
})

describe('sudo', () => {
  it('给出经典的 sudoers 拒绝信息', async () => {
    const r = await runCmd(sudo, ['sudo', 'rm', '-rf', '/'], ctx)
    expect(r.err).toContain('is not in the sudoers file')
    expect(r.code).toBe(1)
  })
})

describe('cowsay', () => {
  it('把文字包进对话气泡里', async () => {
    const r = await runCmd(cowsay, ['cowsay', 'hello'], ctx)
    expect(r.out).toContain('hello')
    expect(r.out).toContain('^__^')
  })

  it('无参数时用默认台词', async () => {
    expect((await runCmd(cowsay, ['cowsay'], ctx)).out.length).toBeGreaterThan(0)
  })

  it('从 stdin 读取', async () => {
    expect((await runCmd(cowsay, ['cowsay'], ctx, 'piped')).out).toContain('piped')
  })
})

describe('neofetch', () => {
  it('输出系统信息与用户名', async () => {
    const r = await runCmd(neofetch, ['neofetch'], ctx)
    expect(r.out).toContain('guest@terminal')
    expect(r.out).toContain('Shell')
  })
})

describe('fortune', () => {
  it('输出一条非空格言', async () => {
    expect((await runCmd(fortune, ['fortune'], ctx)).out.trim().length).toBeGreaterThan(0)
  })
})

describe('exit', () => {
  it('提示无处可逃', async () => {
    const r = await runCmd(exit, ['exit'], ctx)
    expect(r.out.length).toBeGreaterThan(0)
    expect(r.code).toBe(0)
  })
})

describe('rm -rf /', () => {
  it('是彩蛋而不是真的删除', async () => {
    const r = await runCmd(rm, ['rm', '-rf', '/'], ctx)
    expect(r.code).toBe(1)
    expect(r.out + r.err).toContain('nice try')
    expect(ctx.vfs.isDir('/home/guest')).toBe(true)     // 文件树完好
  })

  it('只拦精确的根路径 —— rm -rf /home/guest 仍是真删除', async () => {
    const r = await runCmd(rm, ['rm', '-rf', '/home/guest'], ctx)
    expect(r.code).toBe(0)
    expect(r.out + r.err).not.toContain('nice try')
    expect(ctx.vfs.isDir('/home/guest')).toBe(false)
  })

  it('rm -r / （不带 -f）仍走 EPERM，不是彩蛋', async () => {
    const r = await runCmd(rm, ['rm', '-r', '/'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Operation not permitted')
    expect(r.out + r.err).not.toContain('nice try')
  })
})
