import { describe, it, expect, afterEach } from 'vitest'
import { createBrowserAi } from './languageModel'

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

/** 装一个假的 LanguageModel 全局，模拟不同浏览器环境。 */
function stubGlobal(impl: unknown) {
  ;(globalThis as Record<string, unknown>).LanguageModel = impl
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).LanguageModel
})

describe('createBrowserAi().status()', () => {
  it('全局不存在 LanguageModel 时是 unsupported —— 非 Chrome、版本过低或未开 flag', async () => {
    expect(await createBrowserAi().status()).toEqual({ kind: 'unsupported' })
  })

  const cases: [Availability, string][] = [
    ['available', 'ready'],
    ['downloadable', 'downloadable'],
    ['downloading', 'downloading'],
    ['unavailable', 'unavailable'],
  ]

  for (const [availability, kind] of cases) {
    it(`availability() 返回 ${availability} 时映射为 ${kind}`, async () => {
      stubGlobal({ availability: async () => availability })
      expect(await createBrowserAi().status()).toEqual({ kind })
    })
  }

  it('返回值不在已知枚举里时降级为 unavailable，而不是崩掉', async () => {
    // 这个 API 还在演进，未来可能新增状态值。降级比抛异常好：
    // 访客看到的是「跑不了」，而不是一个炸掉的命令。
    stubGlobal({ availability: async () => 'some-future-state' })
    expect(await createBrowserAi().status()).toEqual({ kind: 'unavailable' })
  })

  it('availability() 抛异常时是 unsupported —— 权限策略可能直接禁掉这个 API', async () => {
    stubGlobal({ availability: async () => { throw new Error('blocked by permissions policy') } })
    expect(await createBrowserAi().status()).toEqual({ kind: 'unsupported' })
  })

  it('全局存在但没有 availability 方法时是 unsupported —— 旧的 window.ai 形状', async () => {
    stubGlobal({})
    expect(await createBrowserAi().status()).toEqual({ kind: 'unsupported' })
  })
})

/** 把字符串数组包成 ReadableStream —— 底层 promptStreaming 返回的就是这个。 */
function streamOf(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(s)
      c.close()
    },
  })
}

describe('createBrowserAi().createSession()', () => {
  it('把 systemPrompt 作为 system 角色传进底层 create()', async () => {
    let seen: unknown
    stubGlobal({
      availability: async () => 'available',
      create: async (opts: unknown) => { seen = opts; return { promptStreaming: () => streamOf([]), destroy() {} } },
    })

    await createBrowserAi().createSession({ systemPrompt: '你是崔小邯' })

    expect(seen).toMatchObject({
      initialPrompts: [{ role: 'system', content: '你是崔小邯' }],
    })
  })

  it('promptStreaming 把底层 ReadableStream 转成可 for-await 的分片', async () => {
    stubGlobal({
      availability: async () => 'available',
      create: async () => ({
        promptStreaming: () => streamOf(['你', '好', '世界']),
        destroy() {},
      }),
    })

    const session = await createBrowserAi().createSession({ systemPrompt: 's' })
    const got: string[] = []
    for await (const piece of session.promptStreaming('hi')) got.push(piece)

    expect(got).toEqual(['你', '好', '世界'])
  })

  it('destroy() 会释放底层 session —— 模型占显存，用完必须放', async () => {
    let destroyed = false
    stubGlobal({
      availability: async () => 'available',
      create: async () => ({
        promptStreaming: () => streamOf([]),
        destroy() { destroyed = true },
      }),
    })

    const session = await createBrowserAi().createSession({ systemPrompt: 's' })
    session.destroy()

    expect(destroyed).toBe(true)
  })

  it('全局不存在时 createSession 抛错 —— 调用方必须先查 status()', async () => {
    await expect(createBrowserAi().createSession({ systemPrompt: 's' })).rejects.toThrow()
  })

  it('把 monitor 里的 downloadprogress 转发给 onProgress', async () => {
    type Listener = (e: { loaded: number }) => void
    let fire: Listener | null = null
    stubGlobal({
      availability: async () => 'downloadable',
      create: async (opts: { monitor?: (m: { addEventListener(t: string, l: Listener): void }) => void }) => {
        opts.monitor?.({ addEventListener(t, l) { if (t === 'downloadprogress') fire = l } })
        return { promptStreaming: () => streamOf([]), destroy() {} }
      },
    })

    const seen: number[] = []
    await createBrowserAi().createSession({ systemPrompt: 's', onProgress: p => seen.push(p) })
    fire!({ loaded: 0.5 })

    expect(seen).toEqual([0.5])
  })

  it('不传 onProgress 时不注册 monitor —— 不为没人听的事件付出代价', async () => {
    let sawMonitor = false
    stubGlobal({
      availability: async () => 'available',
      create: async (opts: { monitor?: unknown }) => {
        sawMonitor = opts.monitor !== undefined
        return { promptStreaming: () => streamOf([]), destroy() {} }
      },
    })

    await createBrowserAi().createSession({ systemPrompt: 's' })

    expect(sawMonitor).toBe(false)
  })
})
