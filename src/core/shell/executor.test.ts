import { describe, it, expect, beforeEach } from 'vitest'
import { lex } from './lexer'
import { parse } from './parser'
import { execute } from './executor'
import { createEnv } from './env'
import { buildInitialVfs } from '../vfs/bootstrap'
import { createRegistry } from '../registry'
import { chunkToText, node, type Chunk, type Ctx, type Host, type Process, type Writer } from '../process'

const noopHost: Host = {
  clear() {}, setTheme() {}, listThemes() { return [] }, currentTheme() { return 'x' },
}

/** 收集输出的终端 writer 替身 */
function collector() {
  const chunks: Chunk[] = []
  const writer: Writer = {
    write(c) { chunks.push(c) },
    writeText(s, style) { chunks.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
    writeLine(s, style) { writer.writeText(s + '\n', style) },
    close() {},
  }
  return { writer, chunks, out: () => chunks.map(chunkToText).join('') }
}

/** 打印固定文本的桩命令 */
const say = (name: string, out: string, code = 0): Process => ({
  name, description: name,
  async run(io) { io.stdout.writeText(out); return code },
})

/** 把 stdin 原样转大写，用于验证管道确实通了 */
const upper: Process = {
  name: 'upper', description: 'upper',
  async run(io) {
    if (!io.stdin) return 1
    for await (const c of io.stdin) io.stdout.writeText(chunkToText(c).toUpperCase())
    return 0
  },
}

let ctx: Ctx

beforeEach(() => {
  const registry = createRegistry()
  registry.register(say('ok', 'ok'))
  registry.register(say('fail', '', 1))
  registry.register(say('hello', 'hello\n'))
  registry.register(upper)
  registry.register({
    name: 'boom', description: 'boom',
    async run() { throw new Error('kaboom') },
  })
  registry.register({
    name: 'warn', description: 'warn',
    async run(io) { io.stderr.writeLine('something went wrong'); return 3 },
  })
  registry.register({
    name: 'rich', description: 'rich',
    async run(io) { io.stdout.write(node(null, () => 'plain-text-form')); return 0 },
  })

  ctx = {
    cwd: '/home/guest', lastExitCode: 0, history: [],
    env: createEnv({ HOME: '/home/guest' }),
    vfs: buildInitialVfs({ '/home/guest/keep.txt': 'old\n' }),
    registry, host: noopHost,
    signal: new AbortController().signal,
  }
})

const run = async (line: string) => {
  const c = collector()
  const code = await execute(parse(lex(line)), ctx, c.writer)
  return { code, out: c.out(), chunks: c.chunks }
}

describe('单命令', () => {
  it('输出写到终端并返回退出码', async () => {
    expect(await run('ok')).toMatchObject({ code: 0, out: 'ok' })
  })

  it('未知命令返回 127 并给出 bash 风格的提示', async () => {
    const r = await run('nosuchcmd')
    expect(r.code).toBe(127)
    expect(r.out).toContain('bash: nosuchcmd: command not found')
  })

  it('命令抛异常时转为退出码 1，异常不外泄', async () => {
    const r = await run('boom')
    expect(r.code).toBe(1)
    expect(r.out).toContain('boom: kaboom')
  })

  it('stderr 默认标红输出到终端', async () => {
    const r = await run('warn')
    expect(r.code).toBe(3)
    expect(r.out).toContain('something went wrong')
    expect(r.chunks.some(c => c.type === 'text' && c.style?.color === 'red')).toBe(true)
  })
})

describe('管道', () => {
  it('上游输出成为下游输入', async () => {
    expect((await run('hello | upper')).out).toBe('HELLO\n')
  })

  it('管道的退出码取最后一个命令', async () => {
    expect((await run('hello | fail')).code).toBe(1)
  })

  it('富节点进入管道时降级为文本', async () => {
    expect((await run('rich | upper')).out).toBe('PLAIN-TEXT-FORM')
  })

  it('富节点直接输出到终端时保持 node 形态', async () => {
    const r = await run('rich')
    expect(r.chunks.some(c => c.type === 'node')).toBe(true)
  })
})

describe('重定向', () => {
  it('> 写入文件且终端无输出', async () => {
    const r = await run('hello > out.txt')
    expect(r.out).toBe('')
    expect(ctx.vfs.readFile('/home/guest/out.txt')).toBe('hello\n')
  })

  it('> 覆盖已有内容', async () => {
    await run('hello > keep.txt')
    expect(ctx.vfs.readFile('/home/guest/keep.txt')).toBe('hello\n')
  })

  it('>> 追加到已有内容', async () => {
    await run('hello >> keep.txt')
    expect(ctx.vfs.readFile('/home/guest/keep.txt')).toBe('old\nhello\n')
  })

  it('2> 捕获 stderr，终端不再显示', async () => {
    const r = await run('warn 2> err.txt')
    expect(r.out).toBe('')
    expect(ctx.vfs.readFile('/home/guest/err.txt')).toBe('something went wrong\n')
  })

  it('父目录不存在时报错而不是静默失败', async () => {
    const r = await run('hello > /no/such/dir/out.txt')
    expect(r.code).toBe(1)
    expect(r.out).toContain('No such file or directory')
  })
})

describe('命令列表与短路', () => {
  it('; 顺序执行两者', async () => {
    expect((await run('hello ; hello')).out).toBe('hello\nhello\n')
  })

  it('&& 在前者失败时跳过后者', async () => {
    expect((await run('fail && hello')).out).toBe('')
  })

  it('&& 在前者成功时执行后者', async () => {
    expect((await run('ok && hello')).out).toBe('okhello\n')
  })

  it('|| 在前者成功时跳过后者', async () => {
    expect((await run('ok || hello')).out).toBe('ok')
  })

  it('|| 在前者失败时执行后者', async () => {
    expect((await run('fail || hello')).out).toBe('hello\n')
  })

  it('短路只跳过本条链，分号后的命令照常执行', async () => {
    expect((await run('fail && ok ; hello')).out).toBe('hello\n')
  })
})

describe('$? 与中断', () => {
  it('执行后更新 ctx.lastExitCode', async () => {
    await run('fail')
    expect(ctx.lastExitCode).toBe(1)
  })

  it('空输入不改变退出码', async () => {
    ctx.lastExitCode = 7
    expect((await run('')).code).toBe(7)
  })

  it('已中断的信号使命令返回 130', async () => {
    const ac = new AbortController()
    ac.abort()
    ctx = { ...ctx, signal: ac.signal }
    expect((await run('ok')).code).toBe(130)
  })
})
