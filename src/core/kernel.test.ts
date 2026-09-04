import { describe, it, expect, beforeEach } from 'vitest'
import { createKernel, type Kernel } from './kernel'
import { buildInitialVfs } from './vfs/bootstrap'
import { chunkToText, type Chunk, type Host, type Process, type Writer } from './process'

const noopHost: Host = {
  clear() {}, setTheme() {}, listThemes() { return ['dracula'] }, currentTheme() { return 'dracula' },
  enterChat() {},
}

const echoStub: Process = {
  name: 'echo', description: 'echo',
  async run(io) { io.stdout.writeText(io.argv.slice(1).join(' ')); return 0 },
}

const cdStub: Process = {
  name: 'cd', description: 'cd',
  async run(io, ctx) {
    const target = io.argv[1] ?? '/home/guest'
    ctx.cwd = ctx.vfs.resolve(ctx.cwd, target)
    return 0
  },
}

function collector() {
  const chunks: Chunk[] = []
  const writer: Writer = {
    write(c) { chunks.push(c) },
    writeText(s, style) { chunks.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
    writeLine(s, style) { writer.writeText(s + '\n', style) },
    close() {},
  }
  return { writer, out: () => chunks.map(chunkToText).join('') }
}

let kernel: Kernel

beforeEach(() => {
  kernel = createKernel({
    vfs: buildInitialVfs({
      '/home/guest/about.md': 'hi',
      '/home/guest/apple.md': '',
      '/home/guest/.hidden': '',
      '/home/guest/projects/p.md': '',
      '/etc/motd': 'welcome',
    }),
    host: noopHost,
    commands: [echoStub, cdStub],
  })
})

const run = async (line: string) => {
  const c = collector()
  const code = await kernel.run(line, c.writer, new AbortController().signal)
  return { code, out: c.out() }
}

describe('run', () => {
  it('执行命令并返回退出码', async () => {
    expect(await run('echo hi')).toMatchObject({ code: 0, out: 'hi' })
  })

  it('语法错误返回 2 并给出 bash 风格提示', async () => {
    const r = await run("echo 'unterminated")
    expect(r.code).toBe(2)
    expect(r.out).toContain('bash:')
  })

  it('非空命令进入历史', async () => {
    await run('echo a')
    await run('   ')
    await run('echo b')
    expect(kernel.ctx.history).toEqual(['echo a', 'echo b'])
  })

  it('$? 反映上一条命令的退出码', async () => {
    await run('nosuchcmd')
    expect((await run('echo $?')).out).toBe('127')
  })
})

describe('prompt', () => {
  it('家目录显示为 ~', () => {
    expect(kernel.prompt()).toBe('guest@terminal:~$ ')
  })

  it('随 cd 变化', async () => {
    await run('cd projects')
    expect(kernel.prompt()).toBe('guest@terminal:~/projects$ ')
  })

  it('家目录之外显示绝对路径', async () => {
    await run('cd /etc')
    expect(kernel.prompt()).toBe('guest@terminal:/etc$ ')
  })
})

describe('complete', () => {
  it('首个单词补全命令名', () => {
    const r = kernel.complete('ec')
    expect(r.candidates).toContain('echo')
    expect(r.replaceFrom).toBe(0)
  })

  it('后续单词补全路径', () => {
    const r = kernel.complete('echo ab')
    expect(r.candidates).toEqual(['about.md'])
    expect(r.replaceFrom).toBe(5)
  })

  it('多个候选全部返回', () => {
    expect(kernel.complete('echo a').candidates.sort()).toEqual(['about.md', 'apple.md'])
  })

  it('目录候选补尾斜杠', () => {
    expect(kernel.complete('echo pro').candidates).toEqual(['projects/'])
  })

  it('带目录前缀时保留前缀', () => {
    expect(kernel.complete('echo projects/').candidates).toEqual(['projects/p.md'])
  })

  it('默认不补全隐藏文件', () => {
    expect(kernel.complete('echo ').candidates).not.toContain('.hidden')
  })

  it('以点开头时可补全隐藏文件', () => {
    expect(kernel.complete('echo .h').candidates).toEqual(['.hidden'])
  })

  it('命令自带 complete 时优先使用', () => {
    kernel.ctx.registry.register({
      name: 'theme', description: 'theme',
      complete() { return ['dracula', 'nord'] },
      async run() { return 0 },
    })
    expect(kernel.complete('theme d').candidates).toEqual(['dracula', 'nord'])
  })

  it('空输入时列出全部命令', () => {
    expect(kernel.complete('').candidates.sort()).toEqual(['cd', 'echo'])
  })

  it('命令自带 complete 抛异常时返回空候选而非冒泡', () => {
    kernel.ctx.registry.register({
      name: 'boom', description: 'boom',
      complete() { throw new Error('boom') },
      async run() { return 0 },
    })
    expect(() => kernel.complete('boom x')).not.toThrow()
    expect(kernel.complete('boom x')).toEqual({ candidates: [], replaceFrom: 5 })
  })
})
