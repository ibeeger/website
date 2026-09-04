import { useCallback, useRef, useState } from 'react'
import type { AiProvider, AiSession } from '../../core/ai/languageModel'

export type ChatPhase = 'idle' | 'thinking' | 'streaming'

export type ChatTurn = {
  id: string
  input: string
  text: string
  phase: ChatPhase
  error?: string
  interrupted?: boolean
}

export interface Chat {
  active: boolean
  phase: ChatPhase
  turns: ChatTurn[]
  inputs: string[]
  enter(opts: { systemPrompt: string }): void
  send(line: string): void
  interrupt(): void
  leave(): void
}

export function useChat(ai: AiProvider): Chat {
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<ChatPhase>('idle')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [inputs, setInputs] = useState<string[]>([])

  // session 与 abort 都放 ref：它们是命令式资源，不该驱动渲染。
  // abort 与 shell 的 abortRef 是两个独立的槽 —— 「中断这一轮生成」
  // 和「中断一条命令」是两件事，共用会让退出逻辑和重入守卫互相污染。
  //
  // session 分两个 ref 存：
  // - sessionPromiseRef 存 createSession() 的 promise 本身。send() 可能在
  //   它 resolve 之前就被调用（enter() 和紧接着的 send() 可能落在同一个
  //   宏任务里，两次独立的 act() 之间不会自动 flush microtask），所以
  //   send() 必须能直接 await 这个 promise，而不是假设它已经 resolve。
  // - sessionRef 缓存 resolve 出来的值，只给 leave() 用：leave() 常常发生
  //   在 promise 早已 resolve 之后，这时若还要走一次 .then() 才能 destroy()，
  //   destroy() 就会晚一个 microtask 才执行 —— 调用方若在 leave() 后同步检查
  //   「已经 destroy」会看到假的失败。有缓存值就能同步 destroy()；
  //   缓存值还没来得及写入时，退化为 promise.then() 异步释放。
  const sessionPromiseRef = useRef<Promise<AiSession> | null>(null)
  const sessionRef = useRef<AiSession | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const idRef = useRef(0)

  const enter = useCallback((opts: { systemPrompt: string }) => {
    setActive(true)
    setPhase('idle')
    setTurns([])
    setInputs([])
    sessionRef.current = null
    const p = ai.createSession({ systemPrompt: opts.systemPrompt })
    sessionPromiseRef.current = p
    void p.then(s => { sessionRef.current = s })
  }, [ai])

  const leave = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const resolved = sessionRef.current
    const pending = sessionPromiseRef.current
    sessionRef.current = null
    sessionPromiseRef.current = null
    if (resolved) resolved.destroy()
    else void pending?.then(s => s.destroy())
    setActive(false)
    setPhase('idle')
    setTurns([])
    setInputs([])
  }, [])

  const interrupt = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const patch = useCallback((id: string, p: Partial<ChatTurn>) => {
    setTurns(prev => prev.map(t => (t.id === id ? { ...t, ...p } : t)))
  }, [])

  const send = useCallback((line: string) => {
    // 单槽守卫：生成中不接新输入。与 useTerminal.submit 的 abortRef 守卫同理。
    if (abortRef.current !== null) return

    // 还没 enter()（或已经 leave()）就没有会话可用，直接忽略。
    const pending = sessionPromiseRef.current
    if (!pending) return

    const id = `t${idRef.current++}`
    setTurns(prev => [...prev, { id, input: line, text: '', phase: 'thinking' }])
    setInputs(prev => [...prev, line])
    setPhase('thinking')

    const ac = new AbortController()
    abortRef.current = ac

    void (async () => {
      try {
        const session = await pending
        let first = true
        for await (const piece of session.promptStreaming(line, { signal: ac.signal })) {
          if (first) { first = false; setPhase('streaming'); patch(id, { phase: 'streaming' }) }
          setTurns(prev => prev.map(t => (t.id === id ? { ...t, text: t.text + piece } : t)))
        }
        patch(id, { phase: 'idle' })
      } catch (e) {
        // 中断和真正的错误要分开：中断是用户主动的，不该显示成红色报错。
        if (ac.signal.aborted) patch(id, { phase: 'idle', interrupted: true })
        else patch(id, { phase: 'idle', error: e instanceof Error ? e.message : String(e) })
      } finally {
        abortRef.current = null
        setPhase('idle')
      }
    })()
  }, [patch])

  return { active, phase, turns, inputs, enter, send, interrupt, leave }
}
