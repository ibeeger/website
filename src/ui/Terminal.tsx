import { useEffect, useMemo, useRef, useState } from 'react'
import { useTerminal } from './useTerminal'
import { OutputBlock } from './OutputBlock'
import { PromptLine } from './PromptLine'
import { useHistory } from './useHistory'
import { useReverseSearch } from './useReverseSearch'
import { useCompletion } from './useCompletion'
import { BootSequence } from './BootSequence'

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

  return (
    <div
      className="terminal"
      role="application"
      aria-label="交互式终端"
      // 点击终端里任意位置都聚焦输入框：这是唯一的焦点恢复手段（尤其是移动端，
      // 一行高的 .promptline 几乎点不中），所以覆盖面要大于那一行。
      onClick={() => inputRef.current?.focus()}
    >
      {!booted && <BootSequence lines={bootLines} onDone={() => setBooted(true)} />}
      {term.blocks.map(b => <OutputBlock key={b.id} block={b} />)}
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
        onHistoryPrev={() => { setInput(history.prev(input)); setHint([]) }}
        onHistoryNext={() => { setInput(history.next()); setHint([]) }}
        onComplete={() => {
          if (search.active) return
          const r = runComplete(input)
          setInput(r.line)
          setHint(r.hint)
        }}
        onReverseSearch={() => (search.active ? search.next() : search.start())}
        onInterrupt={() => {
          if (search.active) { search.cancel(); return }
          term.interrupt()
          setInput('')
          setHint([])
          history.reset()
        }}
        onClearScreen={term.clearScreen}
      />}
      <div ref={bottomRef} />
    </div>
  )
}
