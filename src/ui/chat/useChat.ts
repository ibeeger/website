import { useCallback, useEffect, useRef, useState } from 'react'
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
  // - sessionRef 缓存 resolve 出来的值，只给「同步释放」用：常见路径下
  //   session 早已 resolve，这时若还要走一次 .then() 才能 destroy()，
  //   destroy() 就会晚一个 microtask 才执行 —— 调用方若在 leave() 后同步检查
  //   「已经 destroy」会看到假的失败。有缓存值就能同步 destroy()；
  //   缓存值还没来得及写入时，退化为 promise.then() 异步释放。
  const sessionPromiseRef = useRef<Promise<AiSession> | null>(null)
  const sessionRef = useRef<AiSession | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const idRef = useRef(0)

  // 释放当前持有的 session（若有）并中断在途生成。三处复用：
  // enter() 开头（防止重复 enter() 时旧 session 被静默丢弃、永不 destroy）、
  // leave()、组件卸载时的 effect cleanup（防止 HMR/路由切换/测试的
  // afterEach(cleanup) 让 session 在没人调用 leave() 的情况下悄悄泄漏）。
  // 三处共用同一份逻辑，行为才不会走漂。
  const disposeSession = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const resolved = sessionRef.current
    const pending = sessionPromiseRef.current
    sessionRef.current = null
    sessionPromiseRef.current = null
    if (resolved) resolved.destroy()
    // createSession() 可能 reject（真机上 LanguageModel 形状不对、下载/配额失败）。
    // 这条 .then() 派生链只是「等它 resolve 后 destroy」，不是错误的权威处理者
    // （send() 里的 await pending 才是），reject 时补一个空 catch 防止
    // unhandledrejection —— 不然浏览器里会报未处理拒绝，vitest 里可能判整个 run 失败。
    else void pending?.then(s => s.destroy()).catch(() => {})
  }, [])

  const enter = useCallback((opts: { systemPrompt: string }) => {
    // 重复调用 enter()（比如已经在模式内又触发一次）时，先处理掉上一个
    // session：否则旧 session 永不 destroy()，旧的 abortRef 既不 abort
    // 也不清空会挡住新会话的第一次 send()，旧任务的 setPhase 还可能把
    // 刚进入的干净 idle 状态改成 streaming。
    // enter() 从不在挂载期调用，所以 StrictMode 的双挂载不会误删任何东西。
    disposeSession()
    setActive(true)
    setPhase('idle')
    setTurns([])
    setInputs([])
    const p = ai.createSession({ systemPrompt: opts.systemPrompt })
    sessionPromiseRef.current = p
    // 代次守卫：只有 p 仍是"当前这一代"的 session promise，才允许它写缓存。
    // 没有这层守卫时，disposeSession() 里给同一个 p 注册的 destroy 回调和这里
    // 的缓存回调谁先谁后完全看 resolve 顺序——旧 session 的缓存写入哪怕排在
    // 它自己的 destroy 之后，也可能在下一次 enter()/leave() 时把一个已经
    // destroy 过的 session 重新"救活"进缓存，导致它被 disposeSession() 再
    // destroy 一次，而真正在途的新 session 因为 sessionRef 已经"有值"
    // （其实是旧值）走了同步分支，永远不会被自己的 promise.then(destroy) 兜底。
    void p.then(s => { if (sessionPromiseRef.current === p) sessionRef.current = s }).catch(() => {})
  }, [ai, disposeSession])

  const leave = useCallback(() => {
    disposeSession()
    setActive(false)
    setPhase('idle')
    setTurns([])
    setInputs([])
  }, [disposeSession])

  // 组件卸载（HMR、路由切换、测试的 afterEach(cleanup)）时兜底释放，
  // 不依赖调用方记得手动 leave()。
  useEffect(() => {
    return () => { disposeSession() }
  }, [disposeSession])

  const interrupt = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const patch = useCallback((id: string, p: Partial<ChatTurn>) => {
    setTurns(prev => prev.map(t => (t.id === id ? { ...t, ...p } : t)))
  }, [])

  const send = useCallback((line: string) => {
    // 单槽守卫：生成中不接新输入。与 useTerminal.submit 的 abortRef 守卫同理。
    if (abortRef.current !== null) return

    // 还没 enter()（或已经 leave()）就没有会话可用，静默忽略而不是报错：
    // pending 在 enter() 里同步赋值，!pending 只可能是「根本不在对话模式」，
    // 这时报错会在 Task 4 的路由下产生一条无意义的错误 turn。
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
        // 会话创建期间用户就已经 interrupt() 了：不该再向常驻显存的模型
        // 补发一次 promptStreaming() 请求——这一步做不做完全取决于 provider
        // 是否尊重 signal，而"中断后不下发"应该是 hook 自己保证的不变量。
        if (ac.signal.aborted) { patch(id, { phase: 'idle', interrupted: true }); return }
        let first = true
        for await (const piece of session.promptStreaming(line, { signal: ac.signal })) {
          // 中断不能只靠 provider 主动抛异常：真实 API 也可能只是安静地
          // 停止产出而不抛错。循环体自己查一遍 signal，让「中断即停止」
          // 成为 hook 自身的不变量，不依赖 provider 的实现细节。
          if (ac.signal.aborted) break
          if (first) {
            first = false
            // 只有 ac 仍是「当前那一轮」时，才允许它驱动全局 phase——
            // 见下方 finally 的注释，这里是同一个失效模式的另一半。
            if (abortRef.current === ac) setPhase('streaming')
            patch(id, { phase: 'streaming' })
          }
          setTurns(prev => prev.map(t => (t.id === id ? { ...t, text: t.text + piece } : t)))
        }
        if (ac.signal.aborted) patch(id, { phase: 'idle', interrupted: true })
        else patch(id, { phase: 'idle' })
      } catch (e) {
        // 中断和真正的错误要分开：中断是用户主动的，不该显示成红色报错。
        if (ac.signal.aborted) patch(id, { phase: 'idle', interrupted: true })
        else patch(id, { phase: 'idle', error: e instanceof Error ? e.message : String(e) })
      } finally {
        // 只清「属于自己」的 abortRef：leave() 之后紧跟 enter()+send() 会换上
        // 一个新的 AbortController，这个已经过期的任务恢复执行时，如果无条件
        // 清空/重置，会把新一轮的控制器和 phase 都打回去——新一轮就再也中断
        // 不了，重入守卫也失效了。与 useTerminal.submit 的 abortRef 守卫是
        // 同一类失效模式。
        if (abortRef.current === ac) {
          abortRef.current = null
          setPhase('idle')
        }
      }
    })()
  }, [patch])

  return { active, phase, turns, inputs, enter, send, interrupt, leave }
}
