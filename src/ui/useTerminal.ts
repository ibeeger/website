import { useCallback, useRef, useState } from 'react'
import { createKernel, type Kernel } from '../core/kernel'
import { buildInitialVfs } from '../core/vfs/bootstrap'
import { loadContent } from '../content'
import { builtins } from '../commands'
import { createUiHost, type UiHooks } from './host'
import { createBlockWriter } from './blockWriter'
import type { Block } from './types'

/** scrollback 上限，与真实终端一样丢弃最旧的输出。 */
const MAX_BLOCKS = 500

export function useTerminal() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [running, setRunning] = useState(false)

  const idRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  // 一个跨渲染稳定的可变 box：内核只创建一次，但 box.current 里的钩子实现可以
  // 随时被换成最新的闭包（Task 19 会在 effect 里赋值）。用 useState 的惰性初始值
  // 而不是 useRef —— react-hooks 的 refs 规则会把「把 ref 的值传给函数」标记为
  // 可能在渲染期间读取 ref，而这里 createUiHost 只是保存 box 引用、并不会立即读取
  // box.current；useState 拿到的是普通对象，没有这层（过度保守的）检查。
  const [hooksBox] = useState<{ current: UiHooks }>(() => ({
    current: {
      clear() { setBlocks([]) },
      setTheme() { /* Task 19 接入 */ },
      listThemes() { return [] },
      currentTheme() { return '' },
    },
  }))

  // 惰性初始化：内核只在首次渲染时构造一次。
  // 不要写成 `if (ref.current === null) { ...; setPrompt(...) }` —— 那是 render 阶段 setState。
  const [kernel] = useState<Kernel>(() => createKernel({
    vfs: buildInitialVfs(loadContent()),
    host: createUiHost(hooksBox),
    commands: builtins,        // Task 20 会改成 [...builtins, ...uiCommands]
  }))

  const [prompt, setPrompt] = useState(() => kernel.prompt())

  const submit = useCallback((line: string) => {
    const id = `b${idRef.current++}`
    const block: Block = {
      id, prompt: kernel.prompt(), input: line, chunks: [], exitCode: null,
    }
    setBlocks(prev => [...prev, block].slice(-MAX_BLOCKS))
    setRunning(true)

    const writer = createBlockWriter(id, setBlocks)
    const ac = new AbortController()
    abortRef.current = ac

    void kernel.run(line, writer, ac.signal).then(code => {
      writer.flushNow()
      setBlocks(prev => prev.map(b => (b.id === id ? { ...b, exitCode: code } : b)))
      setRunning(false)
      abortRef.current = null
      setPrompt(kernel.prompt())
    })
  }, [kernel])

  const interrupt = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const complete = useCallback((line: string) => kernel.complete(line), [kernel])

  return { blocks, running, prompt, submit, interrupt, complete }
}
