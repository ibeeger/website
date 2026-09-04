import { buildInitialVfs } from '../core/vfs/bootstrap'
import { createRegistry } from '../core/registry'
import { createEnv } from '../core/shell/env'
import { createPipe } from '../core/pipe'
import { chunkToText, type Chunk, type Ctx, type Host, type Process, type Writer } from '../core/process'
import type { AiProvider, AiStatus } from '../core/ai/languageModel'

export interface FakeAi extends AiProvider {
  created: number              // createSession 被调了几次
  destroyed: number            // session 被释放了几次
  prompts: string[]            // 每次提问的完整 input
  systemPrompts: string[]      // 每次会话的 system prompt
}

/**
 * 假的浏览器模型。真实 API 只在 Chrome 且开了 flag 时存在，
 * 单测里必须换掉 —— 但换掉的是浏览器，不是被测代码。
 */
export function fakeAi(
  status: AiStatus,
  chunks: string[] = [],
  opts: { throwOnPrompt?: boolean } = {},
): FakeAi {
  const fake: FakeAi = {
    created: 0,
    destroyed: 0,
    prompts: [],
    systemPrompts: [],

    async status() { return status },

    async createSession({ systemPrompt }) {
      fake.created++
      fake.systemPrompts.push(systemPrompt)
      return {
        promptStreaming(input, promptOpts) {
          fake.prompts.push(input)
          return (async function* () {
            if (opts.throwOnPrompt) throw new Error('模型炸了')
            for (const c of chunks) {
              if (promptOpts?.signal?.aborted) throw new Error('aborted')
              yield c
            }
          })()
        },
        destroy() { fake.destroyed++ },
      }
    },
  }
  return fake
}

export const testHost: Host = {
  clear() {},
  setTheme() {},
  listThemes() { return ['dracula', 'nord'] },
  currentTheme() { return 'dracula' },
}

export const DEFAULT_FILES: Record<string, string> = {
  '/home/guest/about.md': 'line one\nline two\nline three\n',
  '/home/guest/apple.md': 'apple\n',
  '/home/guest/.hidden': 'secret\n',
  '/home/guest/projects/p.md': 'project p\n',
  '/etc/motd': 'welcome\n',
}

export function makeTestCtx(files: Record<string, string> = DEFAULT_FILES): Ctx {
  const env = createEnv({ HOME: '/home/guest', USER: 'guest', HOSTNAME: 'terminal', PWD: '/home/guest' })
  const session = { cwd: '/home/guest', lastExitCode: 0 }
  return {
    get cwd() { return session.cwd },
    set cwd(v: string) { session.cwd = v; env.set('PWD', v) },
    get lastExitCode() { return session.lastExitCode },
    set lastExitCode(v: number) { session.lastExitCode = v },
    history: [],
    env,
    vfs: buildInitialVfs(files, () => 1_700_000_000_000),
    registry: createRegistry(),
    host: testHost,
    ai: fakeAi({ kind: 'unsupported' }),
    signal: new AbortController().signal,
  }
}

/** 跑一个命令，返回 stdout / stderr 的文本与退出码。 */
export async function runCmd(
  proc: Process,
  argv: string[],
  ctx: Ctx,
  stdinText?: string,
): Promise<{ code: number; out: string; err: string; chunks: Chunk[] }> {
  const outChunks: Chunk[] = []
  const errChunks: Chunk[] = []
  const mk = (sink: Chunk[]): Writer => {
    const w: Writer = {
      write(c) { sink.push(c) },
      writeText(s, style) { sink.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
      writeLine(s, style) { w.writeText(s + '\n', style) },
      close() {},
    }
    return w
  }

  let stdin: AsyncIterable<Chunk> | null = null
  if (stdinText !== undefined) {
    const pipe = createPipe()
    pipe.writer.writeText(stdinText)
    pipe.writer.close()
    stdin = pipe.reader
  }

  const code = await proc.run({ argv, stdin, stdout: mk(outChunks), stderr: mk(errChunks) }, ctx)
  return {
    code,
    out: outChunks.map(chunkToText).join(''),
    err: errChunks.map(chunkToText).join(''),
    chunks: outChunks,
  }
}
