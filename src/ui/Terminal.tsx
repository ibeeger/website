import { useEffect, useMemo, useRef, useState } from 'react'
import { useTerminal } from './useTerminal'
import { OutputBlock } from './OutputBlock'
import { PromptLine } from './PromptLine'
import { useHistory } from './useHistory'
import { useReverseSearch } from './useReverseSearch'
import { useCompletion } from './useCompletion'
import { BootSequence } from './BootSequence'
import { MobileKeyBar, type MobileKey } from './MobileKeyBar'
import { useVisualViewport } from './useVisualViewport'

const BANNER = [
  '  _                      _             _ ',
  ' | |_ ___ _ __ _ __ ___ (_)_ __   __ _| |',
  " | __/ _ \\ '__| '_ ` _ \\| | '_ \\ / _` | |",
  ' | ||  __/ |  | | | | | | | | | | (_| | |',
  '  \\__\\___|_|  |_| |_| |_|_|_| |_|\\__,_|_|',
  '',
]

export function Terminal() {
  const term = useTerminal()
  const [input, setInput] = useState('')
  const [hint, setHint] = useState<string[]>([])
  const [booted, setBooted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const history = useHistory(term.history)
  const search = useReverseSearch(term.history)
  const runComplete = useCompletion(term.complete)
  const { bottomInset } = useVisualViewport()

  const motd = useMemo(() => {
    try { return term.readMotd() } catch { return '' }
  }, [term])

  const bootLines = useMemo(
    () => [...BANNER, ...motd.split('\n')],
    [motd],
  )

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [term.blocks, hint])

  const submit = (line: string) => {
    term.submit(line)
    setInput('')
    setHint([])
    history.reset()
  }

  // 键盘回调与按键条必须走同一份逻辑。各写一份的话，像 search.active 这样的
  // 守卫很容易只加在一边 —— 反向搜索时点屏幕上的 ^C 不会关闭搜索框、点 Tab
  // 会拿过时的 input 去补全，而物理键盘上一切正常。
  const doComplete = () => {
    if (search.active) return
    const r = runComplete(input)
    setInput(r.line)
    setHint(r.hint)
  }

  const doInterrupt = () => {
    if (search.active) { search.cancel(); return }
    term.interrupt()
    setInput('')
    setHint([])
    history.reset()
  }

  const doHistoryPrev = () => { setHint([]); setInput(history.prev(input)) }
  const doHistoryNext = () => { setHint([]); setInput(history.next()) }

  const handleMobileKey = (k: MobileKey) => {
    switch (k) {
      case 'tab': doComplete(); return
      case 'ctrl-c': doInterrupt(); return
      case 'up': doHistoryPrev(); return
      case 'down': doHistoryNext(); return
      default: {
        // 搜索态下这些符号应当进入查询串 —— 物理键盘上敲 `/` 会走 onChange
        // 到 search.type()，按键条没有理由不一致。而这几个符号恰恰是手机键盘
        // 最难打的，所以「搜索时按了没反应」是最差的选择。
        if (search.active) { search.type(search.query + k); return }
        // 插到光标当前所在位置，而不是无条件拼到行尾——否则用户光标停在
        // 行中间时点一下按键条，字符会跑到看不见的地方去（跟真实键盘的
        // 行为不一致）。inputRef 由 Terminal 持有并转交给了 PromptLine，
        // 按键条的按钮又在 mousedown/touchstart 就 preventDefault，所以
        // 点击这一刻焦点与 selectionStart 仍留在真实输入框上，读得到。
        const pos = inputRef.current?.selectionStart ?? input.length
        const next = input.slice(0, pos) + k + input.slice(pos)
        setInput(next)
        const caretAt = pos + k.length
        queueMicrotask(() => inputRef.current?.setSelectionRange(caretAt, caretAt))
      }
    }
  }

  return (
    <div
      className="terminal"
      role="application"
      aria-label="交互式终端"
      style={{ paddingBottom: bottomInset }}
      // 点击终端里任意位置都聚焦输入框：这是唯一的焦点恢复手段（尤其是移动端，
      // 一行高的 .promptline 几乎点不中），所以覆盖面要大于那一行。
      onClick={() => inputRef.current?.focus()}
    >
      {!booted && <BootSequence lines={bootLines} onDone={() => setBooted(true)} />}
      <div aria-live="polite" aria-atomic="false">
        {term.blocks.map(b => <OutputBlock key={b.id} block={b} />)}
      </div>
      {hint.length > 0 && <div className="completion-hint">{hint.join('  ')}</div>}
      {booted && <PromptLine
        prompt={search.active ? `(reverse-i-search)\`${search.query}': ` : term.prompt}
        value={search.active ? search.query : input}
        displayOverride={search.active ? search.match : undefined}
        displayCaret={search.active ? Math.max(0, search.match.indexOf(search.query)) : undefined}
        inputRef={inputRef}
        // 不传 disabled：useTerminal.submit 里的重入守卫已经是唯一必须成立的
        // 不变量，UI 层的 disabled 只会是重复的第二道防线。真做了反而更糟——
        // 浏览器会在 input 变 disabled 的瞬间把焦点踢到 <body>，页面上没有任何
        // 代码把它拿回来：打完一条命令后输入框就悄悄失焦，打字没反应，移动端
        // 虚拟键盘也会跟着收起；Ctrl+C 更是直接失效，因为 disabled 的 input
        // 不会派发键盘事件——而它恰恰要在命令运行时才用得上。
        onChange={v => {
          if (search.active) { search.type(v); return }
          setInput(v)
          setHint([])
        }}
        onSubmit={() => {
          if (search.active) {
            const line = search.accept()
            // 没有命中时 accept() 返回空串；不能无条件 setInput('')，那会把
            // 用户按 Ctrl+R 之前正在打的内容冲掉。
            if (line !== '') setInput(line)
            history.reset()
            return
          }
          submit(input)
        }}
        onHistoryPrev={doHistoryPrev}
        onHistoryNext={doHistoryNext}
        onComplete={doComplete}
        onReverseSearch={() => (search.active ? search.next() : search.start())}
        onInterrupt={doInterrupt}
        onClearScreen={term.clearScreen}
      />}
      {booted && <MobileKeyBar onKey={handleMobileKey} />}
      <div ref={bottomRef} />
    </div>
  )
}
