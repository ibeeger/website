import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { help } from './help'
import { man } from './man'
import { whoami } from './whoami'
import { uname } from './uname'
import { date } from './date'
import { env as envCmd } from './env'
import { exportCmd } from './export'
import { which } from './which'
import { history } from './history'
import { clear } from './clear'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx, Process } from '../../core/process'

let ctx: Ctx

const visible: Process = { name: 'visible', description: '看得见', async run() { return 0 } }
const secret: Process = { name: 'secret', description: '看不见', hidden: true, async run() { return 0 } }
const documented: Process = {
  name: 'documented', description: '有文档', usage: 'documented [选项]', async run() { return 0 },
}

beforeEach(() => {
  ctx = makeTestCtx()
  for (const p of [visible, secret, documented, help, man, which]) ctx.registry.register(p)
})

// date 那条用了假时钟，clear 那条 spyOn 的是模块级共享的 testHost。
// 断言一旦抛出，两者都会泄漏到后续 describe 块 —— 必须在这里统一收拾。
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('help', () => {
  it('列出可见命令及其描述', async () => {
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain('visible')
    expect(r.out).toContain('看得见')
  })

  it('不列出 hidden 命令', async () => {
    expect((await runCmd(help, ['help'], ctx)).out).not.toContain('secret')
  })
})

describe('man', () => {
  it('显示命令的 usage', async () => {
    expect((await runCmd(man, ['man', 'documented'], ctx)).out).toContain('documented [选项]')
  })

  it('没有 usage 时「用法」一节回落为命令名，而不是描述', async () => {
    const out = (await runCmd(man, ['man', 'visible'], ctx)).out
    expect(out).toContain('visible —— 看得见')      // 名称一节带描述
    expect(out).toContain('用法\n    visible\n')   // 用法一节回落为命令名
  })

  it('命令不存在时返回 1', async () => {
    const r = await runCmd(man, ['man', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('No manual entry')
  })

  it('无参数返回 2', async () => {
    expect((await runCmd(man, ['man'], ctx)).code).toBe(2)
  })
})

describe('whoami / uname / date', () => {
  it('whoami 输出 USER', async () => {
    expect((await runCmd(whoami, ['whoami'], ctx)).out).toBe('guest\n')
  })

  it('uname 默认输出 Linux', async () => {
    expect((await runCmd(uname, ['uname'], ctx)).out).toBe('Linux\n')
  })

  it('uname -a 输出完整串', async () => {
    expect((await runCmd(uname, ['uname', '-a'], ctx)).out).toContain('terminal')
  })

  it('date 输出可解析的时间', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T10:00:00Z'))
    const r = await runCmd(date, ['date'], ctx)
    expect(r.out).toContain('2026')
  })
})

describe('env / export', () => {
  it('env 按字典序列出变量', async () => {
    const lines = (await runCmd(envCmd, ['env'], ctx)).out.trim().split('\n')
    expect(lines).toContain('USER=guest')
    expect([...lines].sort()).toEqual(lines)
  })

  it('export 设置变量', async () => {
    await runCmd(exportCmd, ['export', 'FOO=bar'], ctx)
    expect(ctx.env.get('FOO')).toBe('bar')
  })

  it('export 的值可以含等号', async () => {
    await runCmd(exportCmd, ['export', 'A=b=c'], ctx)
    expect(ctx.env.get('A')).toBe('b=c')
  })

  it('export 参数缺少等号时返回 2', async () => {
    expect((await runCmd(exportCmd, ['export', 'FOO'], ctx)).code).toBe(2)
  })

  // 之前只读 argv[1]：export A=1 B=2 会悄悄只设置 A、丢掉 B，还返回 0——
  // 静默的部分成功是最差的失败模式。
  it('export A=1 B=2 两个变量都要设置，不能丢掉后面的操作数', async () => {
    const r = await runCmd(exportCmd, ['export', 'A=1', 'B=2'], ctx)
    expect(r.code).toBe(0)
    expect(ctx.env.get('A')).toBe('1')
    expect(ctx.env.get('B')).toBe('2')
  })

  it('多个操作数里有一个缺等号：合法的仍然生效，同时返回 2 而不是悄悄吞掉', async () => {
    const r = await runCmd(exportCmd, ['export', 'A=1', 'BAD', 'C=3'], ctx)
    expect(r.code).toBe(2)
    expect(ctx.env.get('A')).toBe('1')
    expect(ctx.env.get('C')).toBe('3')
  })
})

describe('which / history / clear', () => {
  it('which 找到已注册的命令', async () => {
    expect((await runCmd(which, ['which', 'visible'], ctx)).out).toBe('/usr/bin/visible\n')
  })

  it('which 找不到时返回 1', async () => {
    expect((await runCmd(which, ['which', 'nope'], ctx)).code).toBe(1)
  })

  it('history 带序号列出历史', async () => {
    ctx.history.push('ls', 'pwd')
    expect((await runCmd(history, ['history'], ctx)).out).toBe('    1  ls\n    2  pwd\n')
  })

  it('clear 调用 host.clear', async () => {
    const spy = vi.spyOn(ctx.host, 'clear')
    await runCmd(clear, ['clear'], ctx)
    expect(spy).toHaveBeenCalledOnce()
  })
})
