import { describe, it, expect, beforeEach } from 'vitest'
import { createKernel, type Kernel } from '../core/kernel'
import { buildInitialVfs } from '../core/vfs/bootstrap'
import { builtins } from './index'
import { testHost, DEFAULT_FILES } from './testkit'
import { chunkToText, type Chunk, type Writer } from '../core/process'

let kernel: Kernel
beforeEach(() => {
  kernel = createKernel({
    vfs: buildInitialVfs(DEFAULT_FILES),
    host: testHost,
    commands: builtins,
  })
})

async function sh(line: string) {
  const chunks: Chunk[] = []
  const w: Writer = {
    write(c) { chunks.push(c) },
    writeText(s, style) { chunks.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
    writeLine(s, style) { w.writeText(s + '\n', style) },
    close() {},
  }
  const code = await kernel.run(line, w, new AbortController().signal)
  return { code, out: chunks.map(chunkToText).join('') }
}

describe('端到端管道', () => {
  it('cat | grep', async () => {
    expect((await sh('cat about.md | grep two')).out).toBe('line two\n')
  })

  it('三段管道', async () => {
    expect((await sh('cat about.md | grep line | wc -l')).out.trim()).toBe('3')
  })

  it('重定向后再读回来', async () => {
    await sh('echo hello > greet.txt')
    expect((await sh('cat greet.txt')).out).toBe('hello\n')
  })

  it('追加重定向', async () => {
    await sh('echo a > f.txt')
    await sh('echo b >> f.txt')
    expect((await sh('cat f.txt')).out).toBe('a\nb\n')
  })

  it('glob 展开后传给命令', async () => {
    expect((await sh('cat *.md | wc -l')).out.trim()).toBe('4')
  })

  it('&& 串联', async () => {
    expect((await sh('cd projects && pwd')).out).toBe('/home/guest/projects\n')
  })

  it('变量展开', async () => {
    expect((await sh('echo $HOME')).out).toBe('/home/guest\n')
  })

  it('管道中命令失败不影响整体不崩溃', async () => {
    const r = await sh('cat nope | wc -l')
    expect(r.out).toContain('No such file or directory')
    expect(r.out).toContain('0')
  })
})
