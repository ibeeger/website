/**
 * Chrome 内置 Prompt API 的适配层。整个代码库里唯一接触 `globalThis.LanguageModel`
 * 的地方 —— 命令只依赖下面的 AiProvider 接口，因此可以脱离浏览器单测。
 *
 * 这个 API 仍在演进：网页环境目前需要 chrome://flags/#prompt-api-for-gemini-nano
 * 或注册 Origin Trial，旧文档里的 `window.ai.languageModel` 形状已废弃。
 * 所以下面对「全局不存在」「形状不对」「调用抛异常」「返回未知枚举值」
 * 四种情况都做了降级，绝不让访客看到一个炸掉的命令。
 */

export type AiStatus =
  | { kind: 'unsupported' }    // 没有这个 API：非 Chrome、版本过低、flag 未开
  | { kind: 'unavailable' }    // 有 API，但硬件/磁盘不达标
  | { kind: 'downloadable' }   // 可用，但模型还没下载（约 2GB）
  | { kind: 'downloading' }    // 正在下载
  | { kind: 'ready' }          // 可以直接用

export interface AiSession {
  /** 逐分片产出模型输出。分片是增量的，直接拼接即可。 */
  promptStreaming(input: string, opts?: { signal?: AbortSignal }): AsyncIterable<string>
  /** 模型常驻显存，用完必须释放。 */
  destroy(): void
}

export interface AiProvider {
  status(): Promise<AiStatus>
  createSession(opts: {
    systemPrompt: string
    signal?: AbortSignal
    /** 模型未下载时，Chrome 会在 create() 期间下载并通过这个回调报进度（0–1）。 */
    onProgress?(loaded: number): void
  }): Promise<AiSession>
}

/** availability() 的返回值 → AiStatus。未知值降级为 unavailable。 */
const STATUS_BY_AVAILABILITY: Record<string, AiStatus['kind']> = {
  available: 'ready',
  downloadable: 'downloadable',
  downloading: 'downloading',
  unavailable: 'unavailable',
}

interface RawSession {
  promptStreaming(input: string, opts?: { signal?: AbortSignal }): ReadableStream<string>
  destroy(): void
}

/** create() 的 monitor 回调收到的对象——只用得到 downloadprogress 这一个事件。 */
type Monitor = { addEventListener(type: string, listener: (e: { loaded: number }) => void): void }

interface CreateOptions {
  initialPrompts: [{ role: 'system'; content: string }]
  signal?: AbortSignal
  monitor?: (m: Monitor) => void
}

type LanguageModelGlobal = {
  availability?: () => Promise<string>
  create?: (opts: CreateOptions) => Promise<RawSession>
}

function getGlobal(): LanguageModelGlobal | undefined {
  return (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel
}

/**
 * ReadableStream → AsyncIterable。不直接 for-await 那个流：
 * TS 的 DOM lib 没给 ReadableStream 声明 Symbol.asyncIterator，
 * 而且并非所有实现都提供它。显式 reader 循环在哪儿都成立。
 */
async function* iterate(stream: ReadableStream<string>): AsyncIterable<string> {
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      if (value !== undefined) yield value
    }
  } finally {
    reader.releaseLock()
  }
}

export function createBrowserAi(): AiProvider {
  return {
    async status() {
      const lm = getGlobal()
      if (typeof lm?.availability !== 'function') return { kind: 'unsupported' }
      try {
        const kind = STATUS_BY_AVAILABILITY[await lm.availability()] ?? 'unavailable'
        return { kind }
      } catch {
        return { kind: 'unsupported' }
      }
    },

    async createSession({ systemPrompt, signal, onProgress }) {
      const lm = getGlobal()
      if (typeof lm?.create !== 'function') {
        throw new Error('LanguageModel 不可用：应先调用 status() 判断')
      }
      const raw = await lm.create({
        initialPrompts: [{ role: 'system', content: systemPrompt }],
        ...(signal ? { signal } : {}),
        // 只在有人听的时候才注册 —— 不为没人听的事件付出代价
        ...(onProgress ? { monitor: (m: Monitor) => { m.addEventListener('downloadprogress', e => onProgress(e.loaded)) } } : {}),
      })
      return {
        promptStreaming(input, opts) {
          return iterate(raw.promptStreaming(input, opts))
        },
        destroy() { raw.destroy() },
      }
    },
  }
}
