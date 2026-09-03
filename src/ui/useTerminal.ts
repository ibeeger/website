import { useCallback, useRef, useState } from 'react'
import { createKernel, type Kernel } from '../core/kernel'
import { buildInitialVfs } from '../core/vfs/bootstrap'
import { loadContent } from '../content'
import { builtins } from '../commands'
import { uiCommands } from './commands'
import { text } from '../core/process'
import { createUiHost, type UiHooks } from './host'
import { createBlockWriter } from './blockWriter'
import { useTheme } from './useTheme'
import type { Block } from './types'

/** scrollback 上限，与真实终端一样丢弃最旧的输出。 */
const MAX_BLOCKS = 500

export function useTerminal() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [running, setRunning] = useState(false)

  const idRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const { theme, setTheme, themes } = useTheme()

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
    },
  }))

  // 每次渲染都刷新，这正是 Task 16 那层间接存在的原因：命令可能在这次渲染的
  // effect 冲刷之前就运行，box 必须已经持有本次渲染的最新回调。
  // eslint-plugin-react-hooks@7 的 immutability 规则会把这行当成「直接改写
  // useState 返回值」而报错——但 hooksBox 从来不是渲染输出的一部分，它是刻意
  // 逃出 React 状态模型之外的一个稳定容器（见上面 Task 16 的注释），react-hooks
  // 规则的静态分析无法区分这种情况。已向控制者报告，此处保留刻意豁免。
  // eslint-disable-next-line react-hooks/immutability -- 见上：hooksBox 是 Task 16 设计的稳定可变容器，不是渲染输出
  hooksBox.current = {
    clear: () => setBlocks([]),
    setTheme,
    listThemes: () => themes,
    currentTheme: () => theme,
  }

  // 惰性初始化：内核只在首次渲染时构造一次。
  // 不要写成 `if (ref.current === null) { ...; setPrompt(...) }` —— 那是 render 阶段 setState。
  const [kernel] = useState<Kernel>(() => createKernel({
    vfs: buildInitialVfs(loadContent()),
    host: createUiHost(hooksBox),
    commands: [...builtins, ...uiCommands],
  }))

  const [prompt, setPrompt] = useState(() => kernel.prompt())

  const submit = useCallback((line: string) => {
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
  }, [kernel])

  const interrupt = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const complete = useCallback((line: string) => kernel.complete(line), [kernel])

  return {
    blocks, running, prompt, submit, interrupt, complete,
    // 这是同一个数组对象、内核原地 push（从不重新赋值），且 push 发生在 run()
    // 的首个 await 之前：useHistory/useReverseSearch 靠这两点才能不经重渲染
    // 就看见新提交的命令。换成 `session.history = [...]` 会悄悄破坏两者。
    history: kernel.ctx.history,
    clearScreen: useCallback(() => { setBlocks([]) }, []),
  }
}
