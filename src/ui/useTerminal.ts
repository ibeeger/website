import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createKernel, type Kernel } from '../core/kernel'
import { buildInitialVfs } from '../core/vfs/bootstrap'
import { loadContent } from '../content'
import { builtins } from '../commands'
import { uiCommands } from './commands'
import { text } from '../core/process'
import { DEFAULT_LANG } from '../i18n/lang'
import { createUiHost, type UiHooks } from './host'
import { createBlockWriter } from './blockWriter'
import { useTheme } from './useTheme'
import { useLang } from './useLang'
import { useChat } from './chat/useChat'
import { createBrowserAi } from '../core/ai/languageModel'
import { createAuthStore } from '../core/auth/store'
import { usernameOf } from '../core/auth/identity'
import { browserGis } from './auth/gis'
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
  const { lang, setLang } = useLang()

  // 一个 provider 实例同时喂给内核（`ask --status` 查可用性）和对话模式
  // （真正提问）。分别造两个的话，命令报告的状态和模式实际用的模型可能不是
  // 同一回事。惰性初始化，避免每次渲染都新建。
  const [ai] = useState(() => createBrowserAi())
  const chat = useChat(ai)

  // 与 ai 同理：惰性建一次，且必须活在 kernel 的 useMemo 之外 ——
  // 切语言会重建内核，登录态不该跟着没。
  // onSignOut 里调 GIS：core 不能碰浏览器全局，这个钩子就是为它留的。
  const [auth] = useState(() => createAuthStore({ onSignOut: () => browserGis.disableAutoSelect() }))

  // 开机欢迎语只在首屏用一次，所以在这里定格。直接在渲染期读 auth.identity()
  // 的话，它是普通可变状态、登录后不会触发重渲染，语义会含糊。
  const [bootIdentity] = useState(() => auth.identity())

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
      setLang() { /* 下面每次渲染都会覆盖成最新实现 */ },
      currentLang() { return DEFAULT_LANG },
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
    setLang,
    currentLang: () => lang,
  }

  // 语言变了就重建内核与 VFS —— 内容是按语言加载的，换语言等于换一整棵文件树。
  // 用 useMemo 而不是 useState 惰性初始化：后者只在首次渲染求值，永远看不到
  // 语言变化。重建会丢掉 shell 历史与 cwd，这是切语言这个动作可接受的代价，
  // lang 命令已经明确提示临时文件会清空。
  //
  // 这里被 memo 的不是派生值，而是整个会话的归属地：VFS（含用户 touch 出来的
  // 文件）、cwd、env、history 都挂在这个内核上。而 React 只把 useMemo 定义为
  // 性能提示，缓存允许被丢弃 —— 真被丢一次，会话就静默重置。之所以可以接受：
  // <Terminal> 在 App 里始终挂载，不在 <Activity>/Offscreen 之下，React 19 的
  // 常驻树不会丢弃它的 memo。若将来把它放进 Offscreen（或任何会卸载/隐藏它的
  // 容器），这里必须改成「渲染期按 lang 调整 state」那套官方模式，不能继续靠
  // useMemo 兜着。
  const kernel = useMemo<Kernel>(() => createKernel({
    vfs: buildInitialVfs(loadContent(lang)),
    host: createUiHost(hooksBox),
    commands: [...builtins, ...uiCommands],
    ai,
    auth,
    // 上次会话登录过就让提示符直接是登录态。切语言重建内核时这里会重新求值，
    // 所以登录后再切语言，提示符也不会退回 guest。
    // 显式标注返回类型：不标注的话，TS 会把三元两支合并推导成
    // `{ USER?: undefined } | { USER: string }`，与 Record<string, string>
    // 的索引签名冲突（TS2322）。这是三元表达式配合索引签名类型的推导缺陷，
    // 不是逻辑问题——两支实际返回的值形状都合法。
    env: ((): Record<string, string> => {
      const id = auth.identity()
      return id === null ? {} : { USER: usernameOf(id) }
    })(),
  }), [lang, hooksBox, ai, auth])

  // 提示符是从内核派生出来的，不再单独存一份状态。存快照的话要在两个时机手动
  // 同步：命令跑完（cd 改了 cwd）、以及内核被语言切换整个换掉 —— 后者只能靠
  // effect 里 setState，那是一次纯粹多余的级联渲染。
  // 派生成立的前提：命令结束时的 setRunning(false) 必然触发一次重渲染，
  // cd 之后的新提示符就在那一次里被重新求值。
  const prompt = kernel.prompt()

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
    // 渲染层也要这份语言：终端外壳自己的可访问名与可见文案（见 i18n/uiText.ts）
    // 得跟着切。不让 <Terminal> 自己再调一次 useLang —— 那会是第二份独立的
    // useState，lang 命令改的是这里这一份，壳上的文案就永远停在初始值。
    lang,
    bootIdentity,
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
