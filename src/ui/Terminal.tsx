import { useEffect, useRef, useState } from 'react'
import { useTerminal } from './useTerminal'
import { OutputBlock } from './OutputBlock'
import { PromptLine } from './PromptLine'

export function Terminal() {
  const term = useTerminal()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // 新输出出现时滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [term.blocks])

  return (
    <div className="terminal" role="application" aria-label="交互式终端">
      {term.blocks.map(b => <OutputBlock key={b.id} block={b} />)}
      <PromptLine
        prompt={term.prompt}
        value={input}
        disabled={term.running}
        onChange={setInput}
        onSubmit={line => { term.submit(line); setInput('') }}
        onHistoryPrev={() => {}}      /* 以下四项 Task 18 接入 */
        onHistoryNext={() => {}}
        onComplete={() => {}}
        onClearScreen={() => {}}
        onReverseSearch={() => {}}
        onInterrupt={term.interrupt}
      />
      <div ref={bottomRef} />
    </div>
  )
}
