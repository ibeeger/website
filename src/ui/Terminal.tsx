import { useEffect, useRef, useState } from 'react'
import { useTerminal } from './useTerminal'
import { OutputBlock } from './OutputBlock'
import { PromptLine } from './PromptLine'
import { useHistory } from './useHistory'
import { useReverseSearch } from './useReverseSearch'
import { useCompletion } from './useCompletion'

export function Terminal() {
  const term = useTerminal()
  const [input, setInput] = useState('')
  const [hint, setHint] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const history = useHistory(term.history)
  const search = useReverseSearch(term.history)
  const runComplete = useCompletion(term.complete)

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [term.blocks, hint])

  const submit = (line: string) => {
    term.submit(line)
    setInput('')
    setHint([])
    history.reset()
  }

  return (
    <div className="terminal" role="application" aria-label="交互式终端">
      {term.blocks.map(b => <OutputBlock key={b.id} block={b} />)}
      {hint.length > 0 && <div className="completion-hint">{hint.join('  ')}</div>}
      <PromptLine
        prompt={search.active ? `(reverse-i-search)\`${search.query}': ` : term.prompt}
        value={search.active ? search.query : input}
        displayOverride={search.active ? search.match : undefined}
        disabled={term.running}
        onChange={v => {
          if (search.active) { search.type(v); return }
          setInput(v)
          setHint([])
        }}
        onSubmit={() => {
          if (search.active) { const line = search.accept(); setInput(line); return }
          submit(input)
        }}
        onHistoryPrev={() => setInput(history.prev(input))}
        onHistoryNext={() => setInput(history.next())}
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
        }}
        onClearScreen={term.clearScreen}
      />
      <div ref={bottomRef} />
    </div>
  )
}
