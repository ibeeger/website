import { useEffect, useRef, useState } from 'react'

export type PromptLineProps = {
  prompt: string
  value: string
  onChange(next: string): void
  onSubmit(line: string): void
  onHistoryPrev(): void
  onHistoryNext(): void
  onComplete(): void
  onInterrupt(): void
  onClearScreen(): void
  onReverseSearch(): void
  /** 搜索态下用它替换自绘文本；真 input 的值仍是用户键入的查询串。Task 18 接上行为 */
  displayOverride?: string
  disabled?: boolean
}

export function PromptLine(props: PromptLineProps) {
  const { prompt, value, onChange, onSubmit } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const [composing, setComposing] = useState(false)
  const [caret, setCaret] = useState(0)

  // 光标位置跟随真 input 的 selectionStart
  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? value.length)
  useEffect(syncCaret, [value])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 输入法候选期间，所有按键都属于输入法，一律放行
    if (composing) return

    if (e.key === 'Enter') { e.preventDefault(); onSubmit(value); return }
    if (e.key === 'Tab') { e.preventDefault(); props.onComplete(); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); props.onHistoryPrev(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); props.onHistoryNext(); return }
    if (e.ctrlKey && e.key === 'c') { e.preventDefault(); props.onInterrupt(); return }
    queueMicrotask(syncCaret)
  }

  const before = value.slice(0, caret)
  const at = value.slice(caret, caret + 1) || ' '
  const after = value.slice(caret + 1)

  return (
    <div className="promptline" onClick={() => inputRef.current?.focus()}>
      <span className="prompt">{prompt}</span>
      <span className="promptline-text">
        {before}
        <span className="cursor">{at}</span>
        {after}
      </span>
      {/*
        真实 input：透明但可聚焦。承接键盘、剪贴板与输入法事件。
        不能用 display:none / visibility:hidden —— 那样无法聚焦，移动端也不会弹键盘。
      */}
      <input
        ref={inputRef}
        className="promptline-input"
        value={value}
        disabled={props.disabled}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onKeyUp={syncCaret}
        onSelect={syncCaret}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => { setComposing(false); syncCaret() }}
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="终端命令输入"
      />
    </div>
  )
}
