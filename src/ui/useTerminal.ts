import { useCallback, useEffect, useRef, useState } from 'react'
import { createKernel, type Kernel } from '../core/kernel'
import { buildInitialVfs } from '../core/vfs/bootstrap'
import { loadContent } from '../content'
import { builtins } from '../commands'
import { uiCommands } from './commands'
import { text } from '../core/process'
import { createUiHost, type UiHooks } from './host'
import { createBlockWriter } from './blockWriter'
import { useTheme } from './useTheme'
import { useChat } from './chat/useChat'
import { createBrowserAi } from '../core/ai/languageModel'
import type { Block } from './types'

/** scrollback 上限，与真实终端一样丢弃最旧的输出。 */
const MAX_BLOCKS = 500

/** 对话模式的提示符。输入行与落进 scrollback 的 block 必须显示同一个，故只写一处。 */
const CHAT_PROMPT = 'ask> '

export function useTerminal() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [running, setRunning] = useState(false)

  const idRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  // 已经投影进 scrollback 的 turn id。只增不减 —— 它要回答的是「这条 turn
  // 投影过吗」，不是「它现在还在不在 blocks 里」。见下面 effect 里的注释。
  const projectedRef = useRef(new Set<string>())

  const { theme, setTheme, themes } = useTheme()

  // 一个 provider 实例同时喂给内核（`ask --status` 查可用性）和对话模式
  // （真正提问）。分别造两个的话，命令报告的状态和模式实际用的模型可能不是
  // 同一回事。惰性初始化，避免每次渲染都新建。
  const [ai] = useState(() => createBrowserAi())
  const chat = useChat(ai)

  // 用 useState 的惰性初始化，而不是 useRef(...).current：
  // react-hooks 的 refs 规则禁止在渲染期读 ref.current，而内核构造时就要拿到这个盒子。
  // 两种写法的初始值都在渲染期求值、行为相同，换写法纯粹是为了不触发该规则。
  // （盒子在渲染期可写这件事到 Task 19 才真正用上：那时命令可能在 effect 冲刷前就运行。）
  const [hooksBox] = useState<{ current: UiHooks }>(() => ({
    current: {
      clear() { setBlocks([]) },
      setTheme() { /* 下面每次渲染都会覆盖成最新实现 */ },
      listThemes() { return [] },
      currentTheme() { return '' },
      enterChat: (opts: { systemPrompt: string }) => { chat.enter(opts) },
    },
  }))

  // 每次渲染都刷新，这正是 Task 16 那层间接存在的原因：命令可能在这次渲染的
  // effect 冲刷之前就运行，box 必须已经持有本次渲染的最新回调。
  // eslint-plugin-react-hooks@7 的 immutability 规则会标记对 useState 派生值的
  // 任何改动（不分渲染期还是 effect 内，时机不能豁免）；改用真正的 useRef 则会让
  // createUiHost(hooksBox) 在惰性初始化里触发 refs 规则。三种 hook 写法都试过，
  // 没有一种能同时满足两条规则 —— 这里是一条正确的模式与一条保守的静态规则冲突，
  // 因此就地窄范围抑制，而不是改写成更差的结构或全局关掉规则。
  // eslint-disable-next-line react-hooks/immutability
  hooksBox.current = {
    clear: () => setBlocks([]),
    setTheme,
    listThemes: () => themes,
    currentTheme: () => theme,
    enterChat: (opts) => { chat.enter(opts) },
  }

  // 惰性初始化：内核只在首次渲染时构造一次。
  // 不要写成 `if (ref.current === null) { ...; setPrompt(...) }` —— 那是 render 阶段 setState。
  const [kernel] = useState<Kernel>(() => createKernel({
    vfs: buildInitialVfs(loadContent()),
    host: createUiHost(hooksBox),
    commands: [...builtins, ...uiCommands],
    ai,
  }))

  const [prompt, setPrompt] = useState(() => kernel.prompt())

  // useChat 管状态、blocks 管渲染，两者用一个 effect 相连，而不是让状态机
  // 直接写 blocks —— 解耦之后 useChat 可以脱离 blocks 独立测试。
  // 之所以不在渲染期从 turns 直接派生出这些 block：对话内容必须在退出模式后
  // 仍留在 scrollback 里，而 leave() 会清空 turns —— blocks 才是那份历史的
  // 归属地，effect 是把状态机的增量投影进去的唯一时机。
  useEffect(() => {
    // 「第一次见到」的判定放在更新函数外面：更新函数必须是纯的（StrictMode 会
    // 重放它），而这一步要写 ref。
    const projected = projectedRef.current
    const fresh = new Set(chat.turns.filter(t => !projected.has(t.id)).map(t => t.id))
    for (const id of fresh) projected.add(id)

    setBlocks(prev => {
      // 退出模式会清空 turns，那一轮在途生成的收尾 patch 就再也到不了已经落进
      // scrollback 的 block —— 生成中输入 exit 的话，思考指示器会永远转下去。
      // 在模式关闭的瞬间定格它们，语义上等同于「退出即中断本轮」。
      // 没有需要定格的就原样返回 prev，让 React 跳过这次重渲染。
      if (!chat.active) {
        const stale = (b: Block) => b.kind === 'chat' && b.phase !== 'idle'
        if (!prev.some(stale)) return prev
        return prev.map(b => (stale(b) ? { ...b, phase: 'idle' as const, interrupted: true } : b))
      }
      const next = [...prev]
      // 一次建索引，而不是每条 turn 各扫一遍 scrollback：流式生成时每个分片都
      // 触发一次这个 effect，逐条 findIndex 是 O(turns x blocks)/分片。
      const indexOf = new Map(next.map((b, i) => [b.id, i]))
      for (const t of chat.turns) {
        const block: Block = {
          id: t.id, prompt: CHAT_PROMPT, input: t.input,
          chunks: t.text === '' ? [] : [text(t.text)],
          exitCode: null, kind: 'chat', phase: t.phase,
          ...(t.error !== undefined ? { error: t.error } : {}),
          ...(t.interrupted === true ? { interrupted: true } : {}),
        }
        const at = indexOf.get(t.id)
        if (at !== undefined) { next[at] = block; continue }
        // 到这里说明 blocks 里没有这条 turn，而这有两种截然不同的成因：它是新
        // turn，或者它的 block 被有意移除过（模式内 Ctrl+L 清屏、MAX_BLOCKS
        // 截断）。只看「找不到」会把两者混为一谈，于是下一个分片就把清掉的对话
        // 重新 push 回队尾 —— 内容复活、顺序还错。只追加第一次见到的 turn。
        if (!fresh.has(t.id)) continue
        indexOf.set(t.id, next.length)
        next.push(block)
      }
      return next.slice(-MAX_BLOCKS)
    })
  }, [chat.active, chat.turns])

  // submit / interrupt / leaveChat 三个 useCallback 都依赖 chat，而 chat 是
  // useChat 每次渲染新建的对象字面量 —— 于是它们每次渲染必然重建。这不是遗漏，
  // 恰恰是它们正确的原因：靠这次重建才能闭包到最新的 chat。若日后把 chat 包进
  // useMemo 来「消掉多余的重建」，这几个回调就会捕获过期的 chat，模式分流会
  // 静默失效（提交被发给一个早已退出的会话，不报任何错）。
  const submit = useCallback((line: string) => {
    // 对话模式的分流刻意排在重入守卫之前，且整条分支不碰 abortRef：模式的生命
    // 期比命令长（ask 早就返回 0 了模式还开着），把它塞进那个单槽会让「有没有
    // 命令在跑」和「在不在模式里」互相污染。useChat 有自己独立的 abort 槽。
    if (chat.active) {
      // 模式内不解析命令，所以退出必须在这里显式拦截 ——
      // 否则 exit 会被原样当成给模型的一句话发出去。
      if (line.trim() === 'exit') { chat.leave(); return }
      chat.send(line)
      return
    }

    // abortRef 与 running 都是单槽，所以同一时刻只允许一条命令在跑。
    // 不在这里挡住的话：命令 A 结束时的收尾会把 running 置假、把 abortRef 清空，
    // 而此时命令 B 还在跑 —— B 就再也中断不了了。
    // UI 层的 disabled 是第二道防线，不能是唯一一道：useTerminal 是公开 hook，
    // 它的状态机不变量不该依赖调用方记得传那个 prop。
    if (abortRef.current !== null) return

    const id = `b${idRef.current++}`
    const block: Block = {
      id, prompt: kernel.prompt(), input: line, chunks: [], exitCode: null,
    }
    setBlocks(prev => [...prev, block].slice(-MAX_BLOCKS))
    setRunning(true)

    const writer = createBlockWriter(id, setBlocks)
    const ac = new AbortController()
    abortRef.current = ac

    void kernel.run(line, writer, ac.signal)
      .then(code => {
        writer.flushNow()
        setBlocks(prev => prev.map(b => (b.id === id ? { ...b, exitCode: code } : b)))
      })
      .catch((e: unknown) => {
        // 今天 kernel.run 不会 reject（内核与执行器都已兜底），但不能依赖那个假设：
        // 上面的防重入守卫要求 abortRef 必须被释放，否则一次 reject 就会把整个会话锁死。
        // 守卫存在的理由是「不变量不依赖未强制的假设」，这里适用同一条理由。
        writer.write(text(`bash: internal error: ${String(e)}\n`, { color: 'red' }))
        writer.flushNow()
        setBlocks(prev => prev.map(b => (b.id === id ? { ...b, exitCode: 1 } : b)))
      })
      .finally(() => {
        // 无论走哪条路径都必须释放，这是防重入守卫成立的前提
        setRunning(false)
        abortRef.current = null
        setPrompt(kernel.prompt())
      })
  }, [kernel, chat])

  const interrupt = useCallback(() => {
    if (chat.active) {
      // 两级 Ctrl+C：生成中先停这一轮，空闲时才退出模式。abort 的是 useChat
      // 自己的槽，shell 的 abortRef 一律不碰。
      if (chat.phase === 'idle') chat.leave()
      else chat.interrupt()
      return
    }
    abortRef.current?.abort()
  }, [chat])

  // Ctrl+D 专用入口。它和 Ctrl+C 的语义不同：EOF 是「我要走了」，无条件退出，
  // 真实 shell 也是这样；Ctrl+C 才有「生成中只停这一轮」的两级语义。两者共用
  // interrupt 那条按 phase 的分流，会让生成中按 Ctrl+D 只中断本轮、人还留在
  // 模式里 —— 与设计文档的契约表和 ask 打印的退出说明都对不上，用户得按两次。
  const leaveChat = useCallback(() => {
    if (chat.active) chat.leave()
  }, [chat])

  const complete = useCallback((line: string) => kernel.complete(line), [kernel])

  return {
    blocks, running,
    prompt: chat.active ? CHAT_PROMPT : prompt,
    chatActive: chat.active,
    chatInputs: chat.inputs,
    submit, interrupt, leaveChat, complete,
    // 这是同一个数组对象、内核原地 push（从不重新赋值），且 push 发生在 run()
    // 的首个 await 之前：useHistory/useReverseSearch 靠这两点才能不经重渲染
    // 就看见新提交的命令。换成 `session.history = [...]` 会悄悄破坏两者。
    history: kernel.ctx.history,
    clearScreen: useCallback(() => { setBlocks([]) }, []),
    readMotd: useCallback(() => {
      try { return kernel.ctx.vfs.readFile('/etc/motd') } catch { return '' }
    }, [kernel]),
  }
}
