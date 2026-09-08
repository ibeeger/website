import { buildInitialVfs } from '../core/vfs/bootstrap'
import { createRegistry } from '../core/registry'
import { createEnv } from '../core/shell/env'
import { createPipe } from '../core/pipe'
import { chunkToText, type Chunk, type Ctx, type Host, type Process, type Writer } from '../core/process'
import type { AiProvider, AiSession, AiStatus } from '../core/ai/languageModel'
import { createAuthStore } from '../core/auth/store'

export interface FakeAi extends AiProvider {
  created: number              // createSession 被调了几次
  destroyed: number            // session 被释放了几次
  prompts: string[]            // 每次提问的完整 input
  systemPrompts: string[]      // 每次会话的 system prompt
  // 每次 createSession() 收到的 signal。createSession 的 signal 是「创建期间」
  // 的中断入口（模型未下载时 create() 里就在下 2GB），与 promptStreaming 的
  // signal 是两个不同的窗口，必须能分别断言。
  signals: (AbortSignal | undefined)[]
  // 每次 destroy() 记一笔"第几个被创建的 session"（从 1 开始）。只看 destroyed
  // 计数分不清"同一个 session 被 destroy 两次"和"两个不同 session 各 destroy
  // 一次"——这两种情况计数完全一样，但前者是泄漏 bug，必须能分辨。
  destroyedSessionIds: number[]
  // 只在 deferSessions 开启时有意义：按创建顺序手动 resolve 第 index 个
  // （从 0 开始）createSession() 调用。用来精确复现"第一个 session 还没
  // resolve 时又 enter() 了一次"这类和 resolve 时序相关的场景——不必赌
  // Promise 天然的落地顺序，测试自己说了算。
  resolveSession(index: number): void
}

/**
 * 假的浏览器模型。真实 API 只在 Chrome 且开了 flag 时存在，
 * 单测里必须换掉 —— 但换掉的是浏览器，不是被测代码。
 */
export function fakeAi(
  status: AiStatus,
  chunks: string[] = [],
  opts: {
    throwOnPrompt?: boolean
    // 生成中途 signal 被 abort 时，安静结束（return）而不是 throw。
    // 真实 provider 未必会主动抛异常——它可能只是让流安静关闭；被测代码
    // 如果只靠 provider 抛异常才能实现"中断"，这个选项能把这个依赖暴露出来。
    silentAbort?: boolean
    // createSession() 直接 reject，模拟真机上初始化失败（形状不对/下载或配额失败）。
    rejectSession?: boolean
    // 分片之间插一个真实的宏任务边界（setTimeout），而不是纯 microtask。
    // 默认关闭：纯 microtask 链条 act()/Promise 链会一次性拉到底，任何基于
    // 真实定时器轮询的 waitFor 都追不上、也没法在"生成到一半"这个窗口内
    // 插入别的操作。只有需要在生成中途插入动作（比如中途 interrupt()）的
    // 用例才需要打开它。
    stepped?: boolean
    // createSession() 不自动 resolve，改成手动用 fake.resolveSession(index)
    // 按顺序放行。默认关闭：本来同步 resolve 的 promise 会自然按调用顺序
    // 依次落地，绝大多数用例不需要管这个。只有需要精确控制"哪个 session
    // 先 resolve"的用例（比如验证两次 enter() 之间的 resolve 时序）才用得上。
    deferSessions?: boolean
    // createSession() 收到 onProgress 时依次回调的进度值（0–1）。
    progress?: number[]
  } = {},
): FakeAi {
  const pendingSessions: Array<(session: AiSession) => void> = []

  const makeSession = (sessionId: number): AiSession => ({
    promptStreaming(input, promptOpts) {
      fake.prompts.push(input)
      return (async function* () {
        if (opts.throwOnPrompt) throw new Error('模型炸了')
        for (const c of chunks) {
          if (promptOpts?.signal?.aborted) {
            if (opts.silentAbort) return
            throw new Error('aborted')
          }
          if (opts.stepped) await new Promise(resolve => setTimeout(resolve, 15))
          yield c
        }
      })()
    },
    destroy() { fake.destroyed++; fake.destroyedSessionIds.push(sessionId) },
  })

  const fake: FakeAi = {
    created: 0,
    destroyed: 0,
    prompts: [],
    systemPrompts: [],
    signals: [],
    destroyedSessionIds: [],

    resolveSession(index) {
      const resolve = pendingSessions[index]
      if (!resolve) throw new Error(`没有第 ${index} 个待 resolve 的 session —— 是不是漏开 deferSessions，或者 index 越界`)
      resolve(makeSession(index + 1))
    },

    async status() { return status },

    async createSession({ systemPrompt, signal, onProgress }) {
      fake.created++
      const sessionId = fake.created
      fake.systemPrompts.push(systemPrompt)
      fake.signals.push(signal)
      // 真实实现里进度事件发生在 create() 期间，这里保持同样的时序
      if (onProgress) for (const p of opts.progress ?? []) onProgress(p)
      if (opts.rejectSession) throw new Error('会话创建失败')
      if (opts.deferSessions) {
        return new Promise<AiSession>(resolve => { pendingSessions.push(resolve) })
      }
      return makeSession(sessionId)
    },
  }
  return fake
}

export const testHost: Host = {
  clear() {},
  setTheme() {},
  listThemes() { return ['dracula', 'nord'] },
  currentTheme() { return 'dracula' },
  enterChat() {},
  setLang() {},
  currentLang() { return 'en' },
}

export interface RecordingHost extends Host {
  chatCalls: { systemPrompt: string }[]
}

export function recordingHost(): RecordingHost {
  const calls: { systemPrompt: string }[] = []
  return {
    ...testHost,
    chatCalls: calls,
    enterChat(opts) { calls.push(opts) },
  }
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
    // 用真 store 而不是替身：它在 node 环境下会因为没有 localStorage 而
    // 静默退化成「不持久」，逻辑本身照跑 —— 造一个替身只会多一份要维护的形状。
    auth: createAuthStore(),
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
