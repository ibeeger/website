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
import { UI_TEXT } from '../i18n/uiText'
import { AUTH_TEXT } from '../i18n/messages'

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

  // 不改 /etc/motd：它模拟的是真实系统文件，塞动态问候会把它弄脏。
  // 欢迎语作为独立一行追加在后面。
  const bootLines = useMemo(
    () => [
      ...BANNER,
      ...motd.split('\n'),
      ...(term.bootIdentity === null ? [] : [AUTH_TEXT[term.lang].welcomeBack(term.bootIdentity.name), '']),
    ],
    [motd, term.bootIdentity, term.lang],
  )

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [term.blocks, hint, bottomInset])

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
    if (term.chatActive) return   // 模式内没有路径可补
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

  // Terminal 内新增一个模式内的游标。模式退出时 chatActive 变假，
  // 游标自然失效 —— 不需要额外清理，因为 inputs 本身也被 leave() 清空了。
  const [chatCursor, setChatCursor] = useState<number | null>(null)

  // 真实 bash 里 Ctrl+R 之后按 ↑/↓ 会先退出搜索、再照常做历史导航——不是原地
  // 挡住。这里选的就是这个语义：先关掉搜索框（search.cancel 不影响 input 里
  // 那份没被搜索碰过的草稿），再对 input 做正常的 prev/next。不这样做的话，
  // ↑/↓ 会在搜索态下悄悄改写藏在覆盖层背后的 input 值，用户在搜索框里却看不到。
  const doHistoryPrev = () => {
    if (term.chatActive) {
      const items = term.chatInputs
      if (items.length === 0) return
      const next = chatCursor === null ? items.length - 1 : Math.max(0, chatCursor - 1)
      setChatCursor(next)
      setInput(items[next]!)
      return
    }
    if (search.active) search.cancel()
    setHint([])
    setInput(history.prev(input))
  }
  const doHistoryNext = () => {
    if (term.chatActive) {
      const items = term.chatInputs
      if (chatCursor === null) return
      const next = chatCursor + 1
      // 走过最后一条就回到空行，和 shell 历史的下沿行为一致
      if (next >= items.length) { setChatCursor(null); setInput(''); return }
      setChatCursor(next)
      setInput(items[next]!)
      return
    }
    if (search.active) search.cancel()
    setHint([])
    setInput(history.next())
  }

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
      aria-label={UI_TEXT[term.lang].terminalLabel}
      style={{ paddingBottom: bottomInset }}
      // 点击终端里任意位置都聚焦输入框：这是唯一的焦点恢复手段（尤其是移动端，
      // 一行高的 .promptline 几乎点不中），所以覆盖面要大于那一行。
      // 但一次拖拽选中输出文字，鼠标松开时同样会在这个公共祖先上派发 click——
      // 如果无条件聚焦，刚选好的文字会被 focus 顺带清掉的 document selection
      // 吞掉，用户永远复制不出这页唯一的内容（比如 contact 打印的邮箱）。
      // 所以先看当前有没有非折叠的选区，有就让它，不抢焦点。
      onClick={() => {
        if (!window.getSelection()?.isCollapsed) return
        inputRef.current?.focus()
      }}
    >
      {!booted && <BootSequence lines={bootLines} onDone={() => setBooted(true)} />}
      <div aria-live="polite" aria-atomic="false">
        {term.blocks.map(b => <OutputBlock key={b.id} block={b} lang={term.lang} />)}
      </div>
      {hint.length > 0 && <div className="completion-hint">{hint.join('  ')}</div>}
      {booted && <PromptLine
        prompt={search.active ? `(reverse-i-search)\`${search.query}': ` : term.prompt}
        value={search.active ? search.query : input}
        displayOverride={search.active ? search.match : undefined}
        displayCaret={search.active ? Math.max(0, search.match.indexOf(search.query)) : undefined}
        inputRef={inputRef}
        // 提示符不在 aria-live 区域内，模式切换对读屏是完全静默的；这个 label
        // 是输入框自身的可访问名，随模式改写后，切换才在无障碍树里留下痕迹，
        // 也顺带把退出方式说给听不到提示符变化的用户。
        // shell 下不覆写 ariaLabel，交给 PromptLine 按 lang 算它自己的默认名 ——
        // 「终端命令输入」这句话只在 i18n/uiText.ts 里写一次。
        lang={term.lang}
        ariaLabel={term.chatActive ? UI_TEXT[term.lang].chatInput : undefined}
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
          setChatCursor(null)
        }}
        onHistoryPrev={doHistoryPrev}
        onHistoryNext={doHistoryNext}
        onComplete={doComplete}
        // Ctrl+R 是继 Tab 和 ↑/↓ 之后的第三个历史入口，模式内同样要挡住 ——
        // 否则反向搜索框会顶掉 ask> 提示符、把一条 shell 命令填进输入框，
        // 回车后它就作为一句话发给了模型。与 doComplete 里那道守卫同构。
        onReverseSearch={() => {
          if (term.chatActive) return
          if (search.active) { search.next(); return }
          search.start()
        }}
        onInterrupt={doInterrupt}
        onClearScreen={term.clearScreen}
        // 走 leaveChat 而不是 interrupt：EOF 无条件退出，不按 phase 分流。
        onEof={term.leaveChat}
      />}
      {booted && <MobileKeyBar onKey={handleMobileKey} />}
      <div ref={bottomRef} />
    </div>
  )
}
