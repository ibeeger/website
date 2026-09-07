import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

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
  onEof?(): void
  /** 搜索态下用它替换自绘文本；真 input 的值仍是用户键入的查询串。 */
  displayOverride?: string
  /** 搜索态下自绘光标该停在 displayOverride 里的哪个位置，而不是真 input 的 selectionStart。 */
  displayCaret?: number
  /** 外部想拿到真 input 的引用时用（比如把整个终端容器都设为点击聚焦）。 */
  inputRef?: RefObject<HTMLInputElement | null>
  /**
   * 输入框的可访问名。默认是 shell 下的说法；调用方在切换交互模式时应当改写它
   * —— 提示符不在 aria-live 区域里，模式变化不会被播报，这个名字是读屏用户
   * 唯一能感知到「现在在哪个模式」的地方。
   */
  ariaLabel?: string
}

export function PromptLine(props: PromptLineProps) {
  const { prompt, value, onChange, onSubmit } = props
  // 用调用方传进来的 ref（比如 Terminal 想让整个容器点击都能聚焦），
  // 没传就退回自己的：两种情况下都直接把这一个 RefObject 交给 React 的
  // ref 属性去挂载，不手写回调去改 props 里的 .current —— 后者会被
  // react-hooks/immutability 判成「渲染后修改 props」。
  const localRef = useRef<HTMLInputElement>(null)
  const inputRef = props.inputRef ?? localRef
  const [composing, setComposing] = useState(false)
  const [caret, setCaret] = useState(0)

  // 光标位置跟随真 input 的 selectionStart
  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? value.length)
  useEffect(syncCaret, [value, inputRef])

  const setAndFocus = (next: string, caretAt: number) => {
    onChange(next)
    queueMicrotask(() => {
      inputRef.current?.setSelectionRange(caretAt, caretAt)
      setCaret(caretAt)
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 三道守卫都要：composing 是我们自己维护的 composition 状态；isComposing 是
    // KeyboardEvent 的标准属性，覆盖「用来上屏的那个回车」在部分浏览器（Chrome/
    // Safari）上先于 compositionend 派发、但 isComposing 仍为 true 的情况；
    // keyCode 229 / key 'Process' 覆盖安卓输入法在拼音候选期间用它们代替真实
    // 按键上报、而 isComposing 却为 false 的情况。
    if (
      composing || e.nativeEvent.isComposing ||
      e.nativeEvent.keyCode === 229 || e.key === 'Process'
    ) return

    const pos = inputRef.current?.selectionStart ?? value.length
    // 只在没有修饰键时才把这些键当命令：否则 Ctrl+Tab / Ctrl+↑ 这类浏览器/
    // 系统级组合键会被 Tab / ArrowUp 分支截胡。
    const bare = !e.ctrlKey && !e.metaKey && !e.altKey

    if (bare && e.key === 'Enter') { e.preventDefault(); onSubmit(value); return }
    if (bare && e.key === 'Escape') { e.preventDefault(); props.onInterrupt(); return }
    if (bare && e.key === 'Tab') { e.preventDefault(); props.onComplete(); return }
    if (bare && e.key === 'ArrowUp') { e.preventDefault(); props.onHistoryPrev(); return }
    if (bare && e.key === 'ArrowDown') { e.preventDefault(); props.onHistoryNext(); return }

    if (e.ctrlKey) {
      switch (e.key) {
        case 'c': e.preventDefault(); props.onInterrupt(); return
        // 与真实 shell 一致：只有输入为空时 Ctrl+D 才是 EOF，
        // 非空时它是「删右边一个字符」，交给浏览器默认行为。
        case 'd':
          if (value === '' && props.onEof) { e.preventDefault(); props.onEof(); return }
          return
        case 'l': e.preventDefault(); props.onClearScreen(); return
        case 'r': e.preventDefault(); props.onReverseSearch(); return
        case 'a': e.preventDefault(); setAndFocus(value, 0); return
        case 'e': e.preventDefault(); setAndFocus(value, value.length); return
        case 'u': e.preventDefault(); setAndFocus(value.slice(pos), 0); return
        case 'k': e.preventDefault(); setAndFocus(value.slice(0, pos), pos); return
        case 'w': {
          e.preventDefault()
          const left = value.slice(0, pos)
          // 先吃掉尾部空格，再吃掉一个词
          const trimmed = left.replace(/\S+\s*$/, '')
          setAndFocus(trimmed + value.slice(pos), trimmed.length)
          return
        }
      }
    }

    queueMicrotask(syncCaret)
  }

  const shown = props.displayOverride ?? value
  const drawnCaret = props.displayCaret ?? caret
  const before = shown.slice(0, drawnCaret)
  const at = shown.slice(drawnCaret, drawnCaret + 1) || ' '
  const after = shown.slice(drawnCaret + 1)

  return (
    <div className="promptline">
      <span className="prompt">{prompt}</span>
      <span className="promptline-text">
        {before}
        <span className="cursor">{at}</span>
        {after}
        {/*
          真实 input：透明但可聚焦。承接键盘、剪贴板与输入法事件。
          不能用 display:none / visibility:hidden —— 那样无法聚焦，移动端也不会弹键盘。
          放在 .promptline-text 内部、以它为定位上下文，而不是整行：否则 input 的
          文本原点会落在提示符下方（跟自绘文字错位），导致 IME 候选框在错误的位置
          弹出、点击定位光标也会算错偏移。
        */}
        <input
          ref={inputRef}
          className="promptline-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onKeyUp={syncCaret}
          onSelect={syncCaret}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => { setComposing(false); syncCaret() }}
          // 组合被中途放弃时（比如移动端切到别的 app）不会触发 compositionend，
          // composing 会永远卡在 true，之后每次按键（包括 Enter）都会被吞掉。
          onBlur={() => setComposing(false)}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={props.ariaLabel ?? '终端命令输入'}
        />
      </span>
    </div>
  )
}
