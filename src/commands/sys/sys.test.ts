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
import { ls } from '../fs/ls'
import { makeTestCtx, runCmd, testHost } from '../testkit'
import type { Ctx, Process } from '../../core/process'
import { commandText } from '../../i18n/commandMeta'

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
    // man 的一级标题（名称/用法）现在跟随语言，这里显式用中文 host
    // 让断言只关注 usage 回落逻辑本身，不被默认语言（en）牵连。
    const zhCtx = { ...ctx, host: { ...testHost, currentLang: () => 'zh' as const } }
    const out = (await runCmd(man, ['man', 'visible'], zhCtx)).out
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

  it('usage 含多行时按行拆开输出，每行都带 4 空格缩进', async () => {
    const multiline: Process = {
      name: 'multiline',
      description: '多行 usage',
      usage: 'multiline [选项]\n  multiline sub   子命令说明',
      async run() { return 0 },
    }
    ctx.registry.register(multiline)
    // 同上：显式用中文 host，断言只关注多行 usage 的拆行逻辑。
    const zhCtx = { ...ctx, host: { ...testHost, currentLang: () => 'zh' as const } }
    const out = (await runCmd(man, ['man', 'multiline'], zhCtx)).out
    expect(out).toContain('用法\n    multiline [选项]\n      multiline sub   子命令说明\n')
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

describe('命令描述查找表', () => {
  it('查得到时返回该语言的文案', () => {
    expect(commandText('ls', 'en').description).toBeTruthy()
    expect(commandText('ls', 'zh').description).toBeTruthy()
    expect(commandText('ls', 'en').description).not.toBe(commandText('ls', 'zh').description)
  })

  it('查不到的命令返回空对象 —— 调用方据此回落到 Process 自带字段', () => {
    expect(commandText('no-such-command', 'en')).toEqual({})
  })
})

describe('help 按语言显示', () => {
  it('英文下显示英文描述', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register(ls)
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain(commandText('ls', 'en').description!)
  })

  it('中文下显示中文描述', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'zh' as const } }
    ctx.registry.register(ls)
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain(commandText('ls', 'zh').description!)
  })

  it('中文下显示的是查找表里的描述，而不是 Process 自带的 —— 两者必须可区分', async () => {
    // ls 自带的 description 恰好和表里的 zh 文案字面相同（表是照抄既有中文
    // 描述建的），上面那条用例因此测不出「查了表」还是「回落」——两条路径
    // 结果一样。这里注册一个同名、自带描述是哨兵字符串的 stub，
    // 只有真的查了表，输出里才会是表中的'列出目录内容'而不是这个哨兵。
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'zh' as const } }
    ctx.registry.register({
      name: 'ls',
      description: '哨兵：这是 Process 自带描述，不该出现在 help 里',
      async run() { return 0 },
    })
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain('列出目录内容')
    expect(r.out).not.toContain('哨兵')
  })

  it('翻译表里没有的命令回落到 Process 自带的 description', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register({ name: 'zzz', description: '自带描述', async run() { return 0 } })
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain('自带描述')
  })
})

// help 与 man 里还有五处 `lang === 'zh' ? ... : ...` 直接写在函数体内 ——
// 一级标题与提示行不走 commandMeta 那张表，i18nCoverage 也就照不到它们。
// 终审做过变异实测：把这几处删成只剩英文，整套 595 条依旧全绿。下面三条把
// 它们钉住：每条都同时断言「本语言那句在」与「另一语言那句不在」，
// 删掉任一侧的字面量都会有用例变红，而不是只在写死成某一种时才红。
describe('help / man 的内联双语文案', () => {
  function langCtx(l: 'en' | 'zh') {
    const c = makeTestCtx()
    c.registry.register(visible)
    return { ...c, host: { ...testHost, currentLang: () => l } }
  }

  it('help 的标题行与末尾提示行跟随语言', async () => {
    const en = (await runCmd(help, ['help'], langCtx('en'))).out
    expect(en).toContain('Available commands:')
    expect(en).toContain('Type `man <command>` for usage. Tab completes, ↑↓ walks history.')
    expect(en).not.toContain('可用命令：')
    expect(en).not.toContain('输入 `man <命令>` 查看用法')

    const zh = (await runCmd(help, ['help'], langCtx('zh'))).out
    expect(zh).toContain('可用命令：')
    expect(zh).toContain('输入 `man <命令>` 查看用法，Tab 键补全，↑↓ 翻历史。')
    expect(zh).not.toContain('Available commands:')
    expect(zh).not.toContain('Type `man <command>` for usage')
  })

  it('man 的两个小节标题跟随语言', async () => {
    const en = (await runCmd(man, ['man', 'visible'], langCtx('en'))).out
    expect(en).toContain('NAME\n')
    expect(en).toContain('USAGE\n')
    expect(en).not.toContain('名称\n')
    expect(en).not.toContain('用法\n')

    const zh = (await runCmd(man, ['man', 'visible'], langCtx('zh'))).out
    expect(zh).toContain('名称\n')
    expect(zh).toContain('用法\n')
    expect(zh).not.toContain('NAME\n')
    expect(zh).not.toContain('USAGE\n')
  })

  it('man 无参数时的用法行跟随语言', async () => {
    const en = (await runCmd(man, ['man'], langCtx('en'))).err
    expect(en).toContain('Usage: man command')
    expect(en).not.toContain('用法: man 命令')

    const zh = (await runCmd(man, ['man'], langCtx('zh'))).err
    expect(zh).toContain('用法: man 命令')
    expect(zh).not.toContain('Usage: man command')
  })
})

describe('man 按语言显示', () => {
  it('英文下显示英文 usage', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register(ls)
    const r = await runCmd(man, ['man', 'ls'], ctx)
    expect(r.out).toContain(commandText('ls', 'en').usage!)
  })

  it('翻译表里没有 usage 时回落到 Process 自带的', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register({ name: 'zzz', description: 'd', usage: 'zzz --自带', async run() { return 0 } })
    const r = await runCmd(man, ['man', 'zzz'], ctx)
    expect(r.out).toContain('zzz --自带')
  })
})
