# ask 对话模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `ask` 无参时进入一个多轮对话模式，等待期间有明确的视觉反馈，并在模型未下载时真正触发下载并显示进度。

**Architecture:** 模式状态放在 UI 层（`useTerminal`），命令通过新增的 `Host.enterChat()` 请求进入，kernel 一行不改。模式内的 block 由 UI 自行构造，因此思考指示器是 block 的渲染态而非一个需要事后删除的 chunk。

**Tech Stack:** TypeScript 5.9、React 19、Vitest 4（`environment: 'node'`，用到 DOM 的测试文件自行 `import '../test-setup'`）、pnpm。

**Spec:** `docs/superpowers/specs/2026-09-04-ask-chat-mode-design.md`

## Global Constraints

- `src/core/` 与 `src/commands/` **禁止运行时依赖 React**，由 ESLint 强制。需要 React 的代码一律放 `src/ui/`。
- 现有 455 个用例全部不得回归，尤其 `src/commands/ai/ask.test.ts` 的 18 个（一次性问答行为不变）。
- TDD：每个任务先写失败测试、跑到确认失败、再写最小实现。
- 每个任务结束时 `pnpm lint && pnpm test && pnpm exec tsc -b` 必须全绿。
- 交互文案用中文，与现有命令风格一致（克制、直接、不用感叹号）。
- 唯一允许接触 `globalThis.LanguageModel` 的文件是 `src/core/ai/languageModel.ts`。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/core/process.ts` | `Host` 接口新增 `enterChat` |
| `src/ui/host.ts` | `UiHooks` 新增 `enterChat`，转发到 box |
| `src/commands/ai/ask.ts` | 无参且 ready 时调 `ctx.host.enterChat()` |
| `src/ui/chat/useChat.ts` | 对话模式状态机（进入/提交一轮/中断/退出） |
| `src/ui/chat/Thinking.tsx` | 点点动画 + 计时的思考指示器 |
| `src/ui/types.ts` | `Block` 增加 `kind` 与 `phase` |
| `src/ui/OutputBlock.tsx` | 按 `kind` 渲染 chat block 与思考态 |
| `src/ui/useTerminal.ts` | `submit` 分流、`prompt` 切换、两级 `interrupt` |
| `src/ui/PromptLine.tsx` | 新增 Ctrl+D 键位 |
| `src/ui/Terminal.tsx` | 接 Ctrl+D，模式内禁用 Tab 与 shell 历史 |
| `src/styles/global.css` | chat block 与思考指示器样式 |

---

### Task 1: Host.enterChat 契约与 ask 无参分流

**Files:**
- Modify: `src/core/process.ts`（`Host` 接口，约 26-31 行）
- Modify: `src/ui/host.ts`（`UiHooks` 与 `createUiHost`）
- Modify: `src/commands/testkit.ts`（`testHost` 补 `enterChat`）
- Modify: `src/commands/ai/ask.ts`（`run` 开头分流）
- Test: `src/commands/ai/ask.test.ts`

**Interfaces:**
- Consumes: `AiProvider.status()`、`buildSystemPrompt(ctx)`（均已存在于 `src/commands/ai/ask.ts`）
- Produces: `Host.enterChat(opts: { systemPrompt: string }): void`

- [ ] **Step 1: 把 testHost 改成可观测的工厂，写失败测试**

`src/commands/testkit.ts` 现在导出的是常量 `testHost`。测试要断言 `enterChat` 被调用，需要一个能记录调用的版本。在 `testkit.ts` 里新增（保留原 `testHost` 不动，别的测试还在用）：

```ts
export interface RecordingHost extends Host {
  chatCalls: { systemPrompt: string }[]
}

export function recordingHost(): RecordingHost {
  const calls: { systemPrompt: string }[] = []
  return {
    ...testHost,
    chatCalls: calls,
    enterChat(opts) { calls.push(opts) },
  }
}
```

在 `src/commands/ai/ask.test.ts` 末尾追加：

```ts
import { recordingHost } from '../testkit'

describe('ask —— 进入对话模式', () => {
  it('无参数且模型 ready 时请求进入对话模式，退出码 0', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }) }
    const r = await runCmd(ask, ['ask'], ctx)
    expect(r.code).toBe(0)
    expect(host.chatCalls).toHaveLength(1)
  })

  it('进入模式时把简历作为 systemPrompt 带上', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }) }
    await runCmd(ask, ['ask'], ctx)
    expect(host.chatCalls[0]!.systemPrompt).toContain('全栈工程师，专注前端架构')
  })

  it('模型不可用时不进入模式 —— 不能让用户进去才发现跑不了', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'unsupported' }) }
    const r = await runCmd(ask, ['ask'], ctx)
    expect(host.chatCalls).toHaveLength(0)
    expect(r.code).toBe(1)
    expect(r.err).toContain('chrome://flags')
  })

  it('带问题时是一次性问答，不进入模式', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }, ['答']) }
    await runCmd(ask, ['ask', '你好'], ctx)
    expect(host.chatCalls).toHaveLength(0)
  })

  it('有管道输入时是一次性问答，不进入模式 —— 管道场景没有交互可言', async () => {
    const host = recordingHost()
    const ctx = { ...makeTestCtx(FILES), host, ai: fakeAi({ kind: 'ready' }, ['答']) }
    await runCmd(ask, ['ask'], ctx, '一段文本\n')
    expect(host.chatCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/commands/ai/ask.test.ts`
Expected: FAIL — `recordingHost` 未导出；`enterChat` 不在 `Host` 类型上。

- [ ] **Step 3: 加接口**

`src/core/process.ts` 的 `Host` 接口末尾加一行：

```ts
export interface Host {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
  /** 请求 UI 进入对话模式。命令调用后立即返回，不等待模式结束。 */
  enterChat(opts: { systemPrompt: string }): void
}
```

`src/ui/host.ts` 的 `UiHooks` 与 `createUiHost` 同步：

```ts
export type UiHooks = {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
  enterChat(opts: { systemPrompt: string }): void
}

export function createUiHost(box: { current: UiHooks }): Host {
  return {
    clear() { box.current.clear() },
    setTheme(name) { box.current.setTheme(name) },
    listThemes() { return box.current.listThemes() },
    currentTheme() { return box.current.currentTheme() },
    enterChat(opts) { box.current.enterChat(opts) },
  }
}
```

`src/commands/testkit.ts` 的 `testHost` 补一个空实现：

```ts
export const testHost: Host = {
  clear() {},
  setTheme() {},
  listThemes() { return ['dracula', 'nord'] },
  currentTheme() { return 'dracula' },
  enterChat() {},
}
```

`src/ui/useTerminal.ts` 的 `hooksBox` 惰性初始值与每次渲染的赋值都要补 `enterChat`，先放空实现占位（Task 4 接真的）：

```ts
// 惰性初始值里
enterChat() { /* Task 4 接入 */ },
// 每次渲染的赋值里
enterChat: () => { /* Task 4 接入 */ },
```

`src/ui/useTerminal.test.tsx:37` 那层 `createKernel` 包装若构造了 Host，同样补齐。

- [ ] **Step 4: ask 里加分流**

`src/commands/ai/ask.ts` 的 `run` 中，在 `--status` 分支之后、`question`/`piped` 计算之后，插入进入模式的分支。改后的顺序是：

```ts
    const question = args.join(' ').trim()
    const piped = io.stdin ? (await readAll(io.stdin)).trim() : ''

    // 无参数、无管道 —— 这是「进入对话模式」的信号。
    // 先确认模型可用再进，否则用户进去才发现跑不了，还得再学一次怎么退出。
    if (!question && !piped) {
      if (status.kind !== 'ready') {
        for (const l of DIAGNOSIS[status.kind]) io.stderr.writeLine(l)
        return 1
      }
      ctx.host.enterChat({ systemPrompt: buildSystemPrompt(ctx) })
      return 0
    }

    if (status.kind !== 'ready') {
      for (const l of DIAGNOSIS[status.kind]) io.stderr.writeLine(l)
      return 1
    }
```

注意：原来「无参数无管道 → 打印用法、退出码 2」那段要删掉，它被上面的分支取代了。`ask.test.ts` 里那条断言退出码 2 的用例也要一并删除——行为变了，旧断言不再成立。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run src/commands/ai/ask.test.ts && pnpm exec tsc -b && pnpm lint`
Expected: 全部 PASS，无类型错误，lint 无输出。

- [ ] **Step 6: 全量回归**

Run: `pnpm test`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: Host.enterChat 契约，ask 无参进入对话模式

先查 status 再进：不能让用户进了模式才发现模型跑不了，
那时他还得再学一次怎么退出。"
```

---

### Task 2: 对话状态机 useChat

**Files:**
- Create: `src/ui/chat/useChat.ts`
- Test: `src/ui/chat/useChat.test.tsx`

**Interfaces:**
- Consumes: `AiProvider`、`AiSession`（`src/core/ai/languageModel.ts`）；`fakeAi`（`src/commands/testkit.ts`）
- Produces:
  ```ts
  export type ChatPhase = 'idle' | 'thinking' | 'streaming'
  export type ChatTurn = { id: string; input: string; text: string; phase: ChatPhase; error?: string; interrupted?: boolean }
  export interface Chat {
    active: boolean
    phase: ChatPhase
    turns: ChatTurn[]
    inputs: string[]
    enter(opts: { systemPrompt: string }): void
    send(line: string): void
    interrupt(): void
    leave(): void
  }
  export function useChat(ai: AiProvider): Chat
  ```

这个 hook 只管状态，不碰 `blocks`。Task 4 才把它接进 `useTerminal`。这样状态机本身可以独立测。

- [ ] **Step 1: 写失败测试**

Create `src/ui/chat/useChat.test.tsx`：

```tsx
import '../test-setup'
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChat } from './useChat'
import { fakeAi } from '../../commands/testkit'

describe('useChat', () => {
  it('初始不在模式内', () => {
    const { result } = renderHook(() => useChat(fakeAi({ kind: 'ready' })))
    expect(result.current.active).toBe(false)
  })

  it('enter() 进入模式', () => {
    const { result } = renderHook(() => useChat(fakeAi({ kind: 'ready' })))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    expect(result.current.active).toBe(true)
    expect(result.current.phase).toBe('idle')
  })

  it('send() 后产生一轮对话，最终拿到完整回答', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['我会 ', 'TypeScript'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('你会什么') })

    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.turns).toHaveLength(1)
    expect(result.current.turns[0]!.input).toBe('你会什么')
    expect(result.current.turns[0]!.text).toBe('我会 TypeScript')
  })

  it('同一个 session 服务多轮 —— 上下文才连得起来', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('第一问') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    act(() => { result.current.send('第二问') })
    await waitFor(() => expect(result.current.turns).toHaveLength(2))

    expect(ai.created).toBe(1)
    expect(ai.prompts).toEqual(['第一问', '第二问'])
  })

  it('leave() 退出模式并释放 session', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    await waitFor(() => expect(ai.created).toBe(1))
    act(() => { result.current.leave() })

    expect(result.current.active).toBe(false)
    expect(ai.destroyed).toBe(1)
  })

  it('模型抛异常时记在这一轮上，不踢出模式', async () => {
    const ai = fakeAi({ kind: 'ready' }, [], { throwOnPrompt: true })
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('hi') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    expect(result.current.active).toBe(true)
    expect(result.current.turns[0]!.error).toContain('模型炸了')
  })

  it('interrupt() 中断当前轮但留在模式内', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['a', 'b', 'c'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('hi') })
    act(() => { result.current.interrupt() })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    expect(result.current.active).toBe(true)
    expect(result.current.turns[0]!.interrupted).toBe(true)
  })

  it('inputs 记录模式内提交过的输入，退出后清空', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['答'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('第一问') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.inputs).toEqual(['第一问'])

    act(() => { result.current.leave() })
    expect(result.current.inputs).toEqual([])
  })

  it('生成中再次 send 被忽略 —— 单槽，与 shell 的重入守卫同理', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['a', 'b'])
    const { result } = renderHook(() => useChat(ai))
    act(() => { result.current.enter({ systemPrompt: 's' }) })
    act(() => { result.current.send('第一问') })
    act(() => { result.current.send('第二问') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    expect(result.current.turns).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/ui/chat/useChat.test.tsx`
Expected: FAIL — `Failed to resolve import "./useChat"`。

- [ ] **Step 3: 实现**

Create `src/ui/chat/useChat.ts`：

```ts
import { useCallback, useRef, useState } from 'react'
import type { AiProvider, AiSession } from '../../core/ai/languageModel'

export type ChatPhase = 'idle' | 'thinking' | 'streaming'

export type ChatTurn = {
  id: string
  input: string
  text: string
  phase: ChatPhase
  error?: string
  interrupted?: boolean
}

export interface Chat {
  active: boolean
  phase: ChatPhase
  turns: ChatTurn[]
  inputs: string[]
  enter(opts: { systemPrompt: string }): void
  send(line: string): void
  interrupt(): void
  leave(): void
}

export function useChat(ai: AiProvider): Chat {
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<ChatPhase>('idle')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [inputs, setInputs] = useState<string[]>([])

  // session 与 abort 都放 ref：它们是命令式资源，不该驱动渲染。
  // abort 与 shell 的 abortRef 是两个独立的槽 —— 「中断这一轮生成」
  // 和「中断一条命令」是两件事，共用会让退出逻辑和重入守卫互相污染。
  const sessionRef = useRef<AiSession | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const idRef = useRef(0)

  const enter = useCallback((opts: { systemPrompt: string }) => {
    setActive(true)
    setPhase('idle')
    setTurns([])
    setInputs([])
    void ai.createSession({ systemPrompt: opts.systemPrompt })
      .then(s => { sessionRef.current = s })
  }, [ai])

  const leave = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    sessionRef.current?.destroy()
    sessionRef.current = null
    setActive(false)
    setPhase('idle')
    setTurns([])
    setInputs([])
  }, [])

  const interrupt = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const patch = useCallback((id: string, p: Partial<ChatTurn>) => {
    setTurns(prev => prev.map(t => (t.id === id ? { ...t, ...p } : t)))
  }, [])

  const send = useCallback((line: string) => {
    // 单槽守卫：生成中不接新输入。与 useTerminal.submit 的 abortRef 守卫同理。
    if (abortRef.current !== null) return

    const id = `t${idRef.current++}`
    setTurns(prev => [...prev, { id, input: line, text: '', phase: 'thinking' }])
    setInputs(prev => [...prev, line])
    setPhase('thinking')

    const ac = new AbortController()
    abortRef.current = ac

    void (async () => {
      try {
        const session = sessionRef.current
        if (!session) throw new Error('会话尚未就绪')
        let first = true
        for await (const piece of session.promptStreaming(line, { signal: ac.signal })) {
          if (first) { first = false; setPhase('streaming'); patch(id, { phase: 'streaming' }) }
          setTurns(prev => prev.map(t => (t.id === id ? { ...t, text: t.text + piece } : t)))
        }
        patch(id, { phase: 'idle' })
      } catch (e) {
        // 中断和真正的错误要分开：中断是用户主动的，不该显示成红色报错。
        if (ac.signal.aborted) patch(id, { phase: 'idle', interrupted: true })
        else patch(id, { phase: 'idle', error: e instanceof Error ? e.message : String(e) })
      } finally {
        abortRef.current = null
        setPhase('idle')
      }
    })()
  }, [patch])

  return { active, phase, turns, inputs, enter, send, interrupt, leave }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/ui/chat/useChat.test.tsx && pnpm exec tsc -b && pnpm lint`
Expected: 9 个用例 PASS。

若 `interrupt` 那条用例 flaky（fake 的分片是同步产出的，可能在 `interrupt()` 之前就跑完），把 `fakeAi` 改成分片之间 `await Promise.resolve()` 让出微任务——改 `testkit.ts` 里的生成器即可，不要改被测代码去迁就测试。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 对话模式状态机 useChat

session 与 abort 用独立的 ref 槽，不与 shell 的 abortRef 共用：
中断一轮生成和中断一条命令是两件事。"
```

---

### Task 3: 思考指示器与 chat block 渲染

**Files:**
- Create: `src/ui/chat/Thinking.tsx`
- Create: `src/ui/chat/Thinking.test.tsx`
- Modify: `src/ui/types.ts`
- Modify: `src/ui/OutputBlock.tsx`
- Modify: `src/ui/OutputBlock.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `ChatPhase`（Task 2）
- Produces: `<Thinking />`；`Block` 新增可选字段 `kind?: 'chat'`、`phase?: ChatPhase`、`error?: string`、`interrupted?: boolean`

- [ ] **Step 1: 写失败测试**

Create `src/ui/chat/Thinking.test.tsx`：

```tsx
import '../test-setup'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Thinking } from './Thinking'

afterEach(() => { vi.useRealTimers() })

describe('Thinking', () => {
  it('渲染可读的等待说明 —— 用户要知道在等什么', () => {
    render(<Thinking />)
    expect(screen.getByText(/思考中/)).toBeTruthy()
  })

  it('对读屏软件宣告为忙碌状态', () => {
    const { container } = render(<Thinking />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
  })

  it('超过一秒后显示已等待秒数 —— 首次唤醒模型很慢，把耗时摆出来', () => {
    vi.useFakeTimers()
    render(<Thinking />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText(/3s/)).toBeTruthy()
  })
})
```

在 `src/ui/OutputBlock.test.tsx` 追加：

```tsx
it('chat block 在 thinking 阶段渲染思考指示器', () => {
  const block: Block = {
    id: 'b1', prompt: 'ask> ', input: '你好', chunks: [],
    exitCode: null, kind: 'chat', phase: 'thinking',
  }
  const { container } = render(<OutputBlock block={block} />)
  expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
})

it('chat block 进入 streaming 后不再渲染思考指示器', () => {
  const block: Block = {
    id: 'b1', prompt: 'ask> ', input: '你好', chunks: [text('回答')],
    exitCode: null, kind: 'chat', phase: 'streaming',
  }
  const { container } = render(<OutputBlock block={block} />)
  expect(container.querySelector('[aria-busy="true"]')).toBeNull()
})

it('中断的 chat block 显示已中断，且保留已生成的内容', () => {
  const block: Block = {
    id: 'b1', prompt: 'ask> ', input: '你好', chunks: [text('半句')],
    exitCode: null, kind: 'chat', phase: 'idle', interrupted: true,
  }
  render(<OutputBlock block={block} />)
  expect(screen.getByText(/已中断/)).toBeTruthy()
  expect(screen.getByText(/半句/)).toBeTruthy()
})

it('出错的 chat block 标红显示错误', () => {
  const block: Block = {
    id: 'b1', prompt: 'ask> ', input: '你好', chunks: [],
    exitCode: null, kind: 'chat', phase: 'idle', error: '模型炸了',
  }
  const { container } = render(<OutputBlock block={block} />)
  expect(container.querySelector('.t-red')?.textContent).toContain('模型炸了')
})

it('普通 block 不受影响 —— 没有 kind 时行为与从前一致', () => {
  const block: Block = {
    id: 'b1', prompt: '$ ', input: 'ls', chunks: [text('a.md')], exitCode: 0,
  }
  const { container } = render(<OutputBlock block={block} />)
  expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  expect(container.querySelector('.block-chat')).toBeNull()
})
```

`OutputBlock.test.tsx` 顶部需要 `import { text } from '../core/process'` 与 `import type { Block } from './types'`（若尚未引入）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/ui/chat/Thinking.test.tsx src/ui/OutputBlock.test.tsx`
Expected: FAIL — 无法解析 `./Thinking`；`Block` 上不存在 `kind`。

- [ ] **Step 3: 实现 Thinking**

Create `src/ui/chat/Thinking.tsx`：

```tsx
import { useEffect, useState } from 'react'

const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80

/**
 * 等待期间的反馈。计时从第一帧就开始累计但一秒后才显示：
 * 首次唤醒本地模型确实要几秒，把耗时摆出来比让用户猜「是不是卡死了」要好；
 * 但对已经预热的模型，秒数一闪而过反而是噪音。
 */
export function Thinking() {
  const [frame, setFrame] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const spin = setInterval(() => setFrame(f => f + 1), FRAME_MS)
    const clock = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => { clearInterval(spin); clearInterval(clock) }
  }, [])

  return (
    <div className="chat-thinking" aria-busy="true" aria-live="polite">
      <span className="chat-spinner" aria-hidden="true">{DOTS[frame % DOTS.length]}</span>
      <span>思考中{elapsed > 0 ? ` ${elapsed}s` : ''}</span>
    </div>
  )
}
```

- [ ] **Step 4: 扩展 Block 类型**

`src/ui/types.ts`：

```ts
import type { Chunk } from '../core/process'
import type { ChatPhase } from './chat/useChat'

export type Block = {
  id: string
  prompt: string
  input: string
  chunks: Chunk[]
  exitCode: number | null
  // 以下仅对话模式使用。普通命令 block 不带这些字段，渲染路径完全不变。
  kind?: 'chat'
  phase?: ChatPhase
  error?: string
  interrupted?: boolean
}
```

- [ ] **Step 5: OutputBlock 按 kind 分支**

`src/ui/OutputBlock.tsx` 的 `OutputBlock` 改成：

```tsx
export function OutputBlock({ block }: { block: Block }) {
  const isChat = block.kind === 'chat'
  return (
    <div className={isChat ? 'block block-chat' : 'block'}>
      <div className="block-input">
        <span className="prompt">{block.prompt}</span>
        <span>{block.input}</span>
      </div>
      {block.chunks.length > 0 && (
        <div className="block-output">
          {block.chunks.map((c, i) => (
            <ErrorBoundary key={i} fallback={() => chunkFallback(c)}>
              <ChunkView chunk={c} />
            </ErrorBoundary>
          ))}
        </div>
      )}
      {isChat && block.phase === 'thinking' && <Thinking />}
      {isChat && block.interrupted === true && <div className="t-dim">^C 已中断</div>}
      {isChat && block.error !== undefined && <div className="t-red">ask: {block.error}</div>}
    </div>
  )
}
```

顶部加 `import { Thinking } from './chat/Thinking'`。

- [ ] **Step 6: 样式**

`src/styles/global.css` 末尾追加。左侧色条把对话与普通命令输出区分开，`--magenta` 是现有主题变量：

```css
.block-chat {
  border-left: 2px solid var(--magenta);
  padding-left: 0.75rem;
}
.chat-thinking {
  color: var(--yellow);
  display: flex;
  gap: 0.5rem;
}
.chat-spinner { display: inline-block; width: 1ch; }

/* 尊重系统的减少动效设置：转圈对前庭敏感的用户是负担 */
@media (prefers-reduced-motion: reduce) {
  .chat-spinner { visibility: hidden; }
}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run src/ui && pnpm exec tsc -b && pnpm lint`
Expected: 全部 PASS。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 思考指示器与 chat block 渲染

指示器是 block 的渲染态而非 chunk，所以中断或出错时
不需要「删掉那个 chunk」——它本来就不在 chunks 里。"
```

---

### Task 4: useTerminal 接线

**Files:**
- Modify: `src/ui/useTerminal.ts`
- Test: `src/ui/useTerminal.test.tsx`

**Interfaces:**
- Consumes: `useChat`（Task 2）、`Block.kind/phase`（Task 3）、`Host.enterChat`（Task 1）
- Produces: `useTerminal()` 返回值新增 `chatActive: boolean` 与 `chatInputs: string[]`；`submit`、`prompt`、`interrupt` 行为按模式分流

`useChat` 维护 `turns`，而 UI 渲染的是 `blocks`。这里用一个 effect 把 `turns` 同步成 chat 类型的 block，而不是让 `useChat` 直接写 `blocks`——保持状态机与渲染解耦，Task 2 的测试才能脱离 blocks 存在。

- [ ] **Step 1: 写失败测试**

在 `src/ui/useTerminal.test.tsx` 追加。注意该文件顶部已有一层 `createKernel` 包装（约 29-40 行），注入 `ai` 需要经过它：

```tsx
it('ask 进入对话模式后提示符变成 ask>', async () => {
  const { result } = renderHook(() => useTerminal())
  act(() => { result.current.submit('ask') })
  await waitFor(() => expect(result.current.chatActive).toBe(true))
  expect(result.current.prompt).toBe('ask> ')
})

it('模式内提交不走 kernel —— 输入发给模型而不是解析成命令', async () => {
  const { result } = renderHook(() => useTerminal())
  act(() => { result.current.submit('ask') })
  await waitFor(() => expect(result.current.chatActive).toBe(true))
  act(() => { result.current.submit('ls') })
  await waitFor(() => {
    const last = result.current.blocks[result.current.blocks.length - 1]!
    expect(last.kind).toBe('chat')
  })
})

it('模式内输入 exit 退出，提示符恢复', async () => {
  const { result } = renderHook(() => useTerminal())
  act(() => { result.current.submit('ask') })
  await waitFor(() => expect(result.current.chatActive).toBe(true))
  act(() => { result.current.submit('exit') })
  await waitFor(() => expect(result.current.chatActive).toBe(false))
  expect(result.current.prompt).not.toBe('ask> ')
})

it('空闲时 interrupt 退出模式', async () => {
  const { result } = renderHook(() => useTerminal())
  act(() => { result.current.submit('ask') })
  await waitFor(() => expect(result.current.chatActive).toBe(true))
  act(() => { result.current.interrupt() })
  await waitFor(() => expect(result.current.chatActive).toBe(false))
})

it('模式内的输入不进 shell 历史', async () => {
  const { result } = renderHook(() => useTerminal())
  const before = result.current.history.length
  act(() => { result.current.submit('ask') })
  await waitFor(() => expect(result.current.chatActive).toBe(true))
  act(() => { result.current.submit('你好') })
  // 只有 'ask' 这一条进了 shell 历史，'你好' 没有
  expect(result.current.history.length).toBe(before + 1)
})
```

「生成中 interrupt」那条要在模型还在产出时调用 `interrupt()`。把 `fakeAi` 的分片改成异步让出（Task 2 Step 4 已改）后，可以：

```tsx
it('生成中 interrupt 停本轮但留在模式内', async () => {
  const { result } = renderHook(() => useTerminal())
  act(() => { result.current.submit('ask') })
  await waitFor(() => expect(result.current.chatActive).toBe(true))
  act(() => { result.current.submit('你好') })
  act(() => { result.current.interrupt() })
  await waitFor(() => {
    const last = result.current.blocks[result.current.blocks.length - 1]!
    expect(last.interrupted).toBe(true)
  })
  expect(result.current.chatActive).toBe(true)
})
```

这些测试需要一个 ready 的 `fakeAi`。在该文件的 `createKernel` 包装里把 `ai` 注入进去：

```tsx
createKernel(opts: Parameters<typeof actual.createKernel>[0]) {
  const real = actual.createKernel({ ...opts, ai: fakeAi({ kind: 'ready' }, ['答', '案']) })
  // ...原有的 force-reject 包装保持不变
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/ui/useTerminal.test.tsx`
Expected: FAIL — `chatActive` 未定义。

- [ ] **Step 3: 实现**

`src/ui/useTerminal.ts` 改动四处。

其一，引入 hook（`kernel` 构造之前，因为 `hooksBox` 要用到它）：

```ts
import { useChat } from './chat/useChat'
import { createBrowserAi } from '../core/ai/languageModel'

// 在 useTerminal 内、hooksBox 之前
const [ai] = useState(() => createBrowserAi())
const chat = useChat(ai)
```

`createKernel` 的 `ai` 参数也传同一个实例，保证命令查到的可用性与模式用的是同一个 provider：

```ts
const [kernel] = useState<Kernel>(() => createKernel({
  vfs: buildInitialVfs(loadContent()),
  host: createUiHost(hooksBox),
  commands: [...builtins, ...uiCommands],
  ai,
}))
```

其二，`hooksBox` 的两处（惰性初始值与每次渲染的赋值）把 Task 1 的占位换成真的：

```ts
enterChat: (opts: { systemPrompt: string }) => chat.enter(opts),
```

其三，把 `chat.turns` 同步成 blocks：

```ts
// useChat 管状态、blocks 管渲染，两者用一个 effect 相连而不是让状态机直接写
// blocks —— 解耦之后 useChat 可以脱离 blocks 独立测试。
useEffect(() => {
  if (!chat.active) return
  setBlocks(prev => {
    const next = [...prev]
    for (const t of chat.turns) {
      const at = next.findIndex(b => b.id === t.id)
      const block: Block = {
        id: t.id, prompt: 'ask> ', input: t.input,
        chunks: t.text === '' ? [] : [text(t.text)],
        exitCode: null, kind: 'chat', phase: t.phase,
        ...(t.error !== undefined ? { error: t.error } : {}),
        ...(t.interrupted === true ? { interrupted: true } : {}),
      }
      if (at === -1) next.push(block)
      else next[at] = block
    }
    return next.slice(-MAX_BLOCKS)
  })
}, [chat.active, chat.turns])
```

其四，`submit` / `prompt` / `interrupt` 分流：

```ts
const submit = useCallback((line: string) => {
  if (chat.active) {
    // exit 与 Ctrl+D 是退出模式的两个入口。模式内不解析命令，
    // 所以这里必须显式拦截 —— 否则 exit 会被当成给模型的一句话。
    if (line.trim() === 'exit') { chat.leave(); return }
    chat.send(line)
    return
  }
  // ...以下保持原有实现不变
}, [kernel, chat])

const interrupt = useCallback(() => {
  if (chat.active) {
    // 两级：生成中先停这一轮，空闲时才退出模式。
    if (chat.phase === 'idle') chat.leave()
    else chat.interrupt()
    return
  }
  abortRef.current?.abort()
}, [chat])
```

返回值里 `prompt` 改为 `chat.active ? 'ask> ' : prompt`，并新增 `chatActive: chat.active`：

```ts
return {
  blocks, running,
  prompt: chat.active ? 'ask> ' : prompt,
  chatActive: chat.active,
  submit, interrupt, complete,
  // ...其余不变
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/ui/useTerminal.test.tsx && pnpm exec tsc -b && pnpm lint`
Expected: PASS。

若 react-hooks 的 immutability 规则对 `hooksBox.current` 的赋值报新错，沿用文件里既有的窄范围 `eslint-disable-next-line react-hooks/immutability`，不要全局关规则——理由见该处已有的长注释。

- [ ] **Step 5: 全量回归**

Run: `pnpm test`
Expected: 全绿。特别确认 `Terminal.test.tsx` 里「命令运行期间 input 不被 disabled」那条回归用例仍通过。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: useTerminal 按模式分流 submit/prompt/interrupt

两级 Ctrl+C：生成中停本轮，空闲时退模式。
turns 经由 effect 同步成 blocks，状态机与渲染保持解耦。"
```

---

### Task 5: Ctrl+D 退出与模式内键位调整

**Files:**
- Modify: `src/ui/PromptLine.tsx:68-85`
- Modify: `src/ui/PromptLine.test.tsx`
- Modify: `src/ui/Terminal.tsx`
- Modify: `src/ui/Terminal.test.tsx`

**Interfaces:**
- Consumes: `useTerminal().chatActive`（Task 4）
- Produces: `PromptLine` 新增可选 prop `onEof?(): void`

- [ ] **Step 1: 写失败测试**

`src/ui/PromptLine.test.tsx` 追加：

```tsx
it('输入为空时 Ctrl+D 触发 onEof', async () => {
  const onEof = vi.fn()
  render(<PromptLine prompt="ask> " value="" onChange={vi.fn()} onSubmit={vi.fn()}
    onHistoryPrev={vi.fn()} onHistoryNext={vi.fn()} onComplete={vi.fn()}
    onReverseSearch={vi.fn()} onInterrupt={vi.fn()} onClearScreen={vi.fn()} onEof={onEof} />)
  await userEvent.type(screen.getByRole('textbox'), '{Control>}d{/Control}')
  expect(onEof).toHaveBeenCalled()
})

it('输入非空时 Ctrl+D 不触发 onEof —— 与真实 shell 一致', async () => {
  const onEof = vi.fn()
  render(<PromptLine prompt="ask> " value="abc" onChange={vi.fn()} onSubmit={vi.fn()}
    onHistoryPrev={vi.fn()} onHistoryNext={vi.fn()} onComplete={vi.fn()}
    onReverseSearch={vi.fn()} onInterrupt={vi.fn()} onClearScreen={vi.fn()} onEof={onEof} />)
  await userEvent.type(screen.getByRole('textbox'), '{Control>}d{/Control}')
  expect(onEof).not.toHaveBeenCalled()
})
```

`src/ui/Terminal.test.tsx` 追加：

```tsx
it('对话模式下 Tab 不做补全 —— 模式内没有路径可补', async () => {
  render(<Terminal />)
  const input = screen.getByRole('textbox')
  await userEvent.type(input, 'ask{Enter}')
  await screen.findByText(/ask> /)
  await userEvent.type(input, 'ab{Tab}')
  expect((input as HTMLInputElement).value).toBe('ab')
})

it('对话模式下 ↑ 翻的是本次对话的输入，不是 shell 历史', async () => {
  render(<Terminal />)
  const input = screen.getByRole('textbox')
  // 先在 shell 里留一条历史，它不该在模式内被翻出来
  await userEvent.type(input, 'pwd{Enter}')
  await userEvent.type(input, 'ask{Enter}')
  await screen.findByText(/ask> /)
  await userEvent.type(input, '第一问{Enter}')
  await userEvent.type(input, '{ArrowUp}')
  expect((input as HTMLInputElement).value).toBe('第一问')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/ui/PromptLine.test.tsx src/ui/Terminal.test.tsx`
Expected: FAIL — `onEof` 不是合法 prop；Tab 仍然触发了补全。

- [ ] **Step 3: PromptLine 加 Ctrl+D**

`src/ui/PromptLine.tsx` 的 props 类型加 `onEof?(): void`，并在 `if (e.ctrlKey)` 的 switch 里加一个分支（放在 `case 'c'` 之后）：

```ts
        // 与真实 shell 一致：只有输入为空时 Ctrl+D 才是 EOF，
        // 非空时它是「删右边一个字符」，交给浏览器默认行为。
        case 'd':
          if (value === '' && props.onEof) { e.preventDefault(); props.onEof(); return }
          return
```

- [ ] **Step 4: Terminal 接线**

`src/ui/Terminal.tsx`：

`doComplete` 开头加模式守卫：

```ts
const doComplete = () => {
  if (term.chatActive) return   // 模式内没有路径可补
  if (search.active) return
  // ...原有实现
}
```

`doHistoryPrev` / `doHistoryNext` 改成按模式取不同的历史源。`useChat` 已经把模式内提交过的输入记在 `chat.inputs` 里（Task 2），这里用它，而不是让 ↑/↓ 翻出 shell 历史：

```ts
// Terminal 内新增一个模式内的游标。模式退出时 chatActive 变假，
// 游标自然失效 —— 不需要额外清理，因为 inputs 本身也被 leave() 清空了。
const [chatCursor, setChatCursor] = useState<number | null>(null)

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
```

提交一轮后要把游标复位，否则下一次按 ↑ 会从上次停的位置继续。在 `PromptLine` 的 `onSubmit` 分支里，调用 `submit(input)` 之后加 `setChatCursor(null)`。

这需要 `useTerminal` 额外暴露 `chatInputs`。在 Task 4 的返回值里补一行：

```ts
chatInputs: chat.inputs,
```

`PromptLine` 补一个 prop：

```tsx
onEof={() => { if (term.chatActive) term.interrupt() }}
```

模式内空输入时 Ctrl+D 走 `interrupt()`，而 `interrupt()` 在 `phase === 'idle'` 时正是退出模式（Task 4）。非模式下 `onEof` 什么都不做。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run src/ui && pnpm exec tsc -b && pnpm lint`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: Ctrl+D 退出对话模式，模式内禁用 Tab 与 shell 历史

Ctrl+D 只在输入为空时是 EOF，非空时保留浏览器的删字符行为，
与真实 shell 一致。"
```

---

### Task 6: 下载进度

**Files:**
- Modify: `src/core/ai/languageModel.ts`
- Modify: `src/core/ai/languageModel.test.ts`
- Modify: `src/commands/ai/ask.ts`
- Modify: `src/commands/ai/ask.test.ts`

**Interfaces:**
- Consumes: `AiProvider`
- Produces: `createSession(opts)` 的 `opts` 新增可选 `onProgress?(loaded: number): void`

`downloadable` 时不再只提示「去下载」，而是真正触发下载并画进度条。这条独立于对话模式——它解决的是同一个问题的另一半：用户不仅要知道该等，还要知道等的是什么。

- [ ] **Step 1: 写失败测试**

`src/core/ai/languageModel.test.ts` 追加：

```ts
it('把 monitor 里的 downloadprogress 转发给 onProgress', async () => {
  type Listener = (e: { loaded: number }) => void
  let fire: Listener | null = null
  stubGlobal({
    availability: async () => 'downloadable',
    create: async (opts: { monitor?: (m: { addEventListener(t: string, l: Listener): void }) => void }) => {
      opts.monitor?.({ addEventListener(t, l) { if (t === 'downloadprogress') fire = l } })
      return { promptStreaming: () => streamOf([]), destroy() {} }
    },
  })

  const seen: number[] = []
  await createBrowserAi().createSession({ systemPrompt: 's', onProgress: p => seen.push(p) })
  fire!({ loaded: 0.5 })

  expect(seen).toEqual([0.5])
})

it('不传 onProgress 时不注册 monitor —— 不为没人听的事件付出代价', async () => {
  let sawMonitor = false
  stubGlobal({
    availability: async () => 'available',
    create: async (opts: { monitor?: unknown }) => {
      sawMonitor = opts.monitor !== undefined
      return { promptStreaming: () => streamOf([]), destroy() {} }
    },
  })

  await createBrowserAi().createSession({ systemPrompt: 's' })

  expect(sawMonitor).toBe(false)
})
```

`fakeAi` 需要能驱动 `onProgress`。先改 `src/commands/testkit.ts`：构造参数的 `opts` 加 `progress?: number[]`，`createSession` 的实现里在返回之前依次触发：

```ts
export function fakeAi(
  status: AiStatus,
  chunks: string[] = [],
  opts: { throwOnPrompt?: boolean; progress?: number[] } = {},
): FakeAi {
  // ...
    async createSession({ systemPrompt, onProgress }) {
      fake.created++
      fake.systemPrompts.push(systemPrompt)
      // 真实实现里进度事件发生在 create() 期间，这里保持同样的时序
      if (onProgress) for (const p of opts.progress ?? []) onProgress(p)
      return {
        // ...其余不变
      }
    },
}
```

然后在 `src/commands/ai/ask.test.ts` 追加：

```ts
it('downloadable 时触发下载并输出进度', async () => {
  const ctx = {
    ...makeTestCtx(FILES),
    ai: fakeAi({ kind: 'downloadable' }, ['答'], { progress: [0.25, 1] }),
  }
  const r = await runCmd(ask, ['ask', '你好'], ctx)
  expect(r.out).toContain('25%')
  expect(r.out).toContain('100%')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/core/ai/languageModel.test.ts src/commands/ai/ask.test.ts`
Expected: FAIL — `onProgress` 不在 `createSession` 的参数类型上。

- [ ] **Step 3: 适配层实现**

`src/core/ai/languageModel.ts`：

`AiProvider.createSession` 的签名加 `onProgress`：

```ts
export interface AiProvider {
  status(): Promise<AiStatus>
  createSession(opts: {
    systemPrompt: string
    signal?: AbortSignal
    /** 模型未下载时，Chrome 会在 create() 期间下载并通过这个回调报进度（0–1）。 */
    onProgress?(loaded: number): void
  }): Promise<AiSession>
}
```

`RawSession` 之外补 monitor 的类型，并在 `createSession` 里按需传：

```ts
type Monitor = { addEventListener(type: string, listener: (e: { loaded: number }) => void): void }

// createSession 内
const raw = await lm.create({
  initialPrompts: [{ role: 'system', content: systemPrompt }],
  ...(signal ? { signal } : {}),
  // 只在有人听的时候才注册 —— 不为没人听的事件付出代价
  ...(onProgress ? { monitor: (m: Monitor) => { m.addEventListener('downloadprogress', e => onProgress(e.loaded)) } } : {}),
})
```

`lm.create` 的入参类型从 `unknown` 收窄成一个具名结构，避免 `any`。

- [ ] **Step 4: ask 里画进度条**

`src/commands/ai/ask.ts`：`downloadable` 不再走 `DIAGNOSIS` 直接返回，而是先告知再下载。在 `status.kind !== 'ready'` 的判断之前插入：

```ts
    // downloadable 是唯一「现在做点什么就能变可用」的状态。
    // 只提示「去下载」是把一个 2GB 的黑箱丢给用户，所以这里直接触发并报进度。
    if (status.kind === 'downloadable') {
      io.stdout.writeLine('内置模型尚未下载，开始下载（约 2GB，只需一次）…')
    }
```

并把 `createSession` 的调用改为带进度回调。进度条只在 `downloadable` 时输出：

```ts
      const bar = (p: number) => {
        const pct = Math.round(p * 100)
        const filled = Math.round(p * 20)
        return `[${'#'.repeat(filled)}${'.'.repeat(20 - filled)}] ${pct}%`
      }
      session = await ctx.ai.createSession({
        systemPrompt: buildSystemPrompt(ctx),
        ...(status.kind === 'downloadable'
          ? { onProgress: (p: number) => io.stdout.writeLine(bar(p)) }
          : {}),
      })
```

注意 `status.kind !== 'ready'` 的早退分支现在要排除 `downloadable`：

```ts
    if (status.kind !== 'ready' && status.kind !== 'downloadable') {
      for (const l of DIAGNOSIS[status.kind]) io.stderr.writeLine(l)
      return 1
    }
```

`DIAGNOSIS.downloadable` 的文案随之改成「下载完成后可以直接提问」，因为它现在只在 `ask` 无参进入模式的前置检查里出现（那条路径仍然不进模式）。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run src/core/ai src/commands/ai && pnpm exec tsc -b && pnpm lint`
Expected: PASS。

- [ ] **Step 6: 全量回归与构建**

Run: `pnpm test && pnpm build`
Expected: 全绿，构建成功。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: downloadable 时真正触发下载并显示进度条

只提示「去下载」是把一个 2GB 的黑箱丢给用户。
monitor 只在有人听进度时才注册。"
```

---

### Task 7: 文档与引导

**Files:**
- Modify: `README.md`
- Modify: `src/content/about.md`
- Modify: `src/commands/ai/ask.ts`（`description` 与 `usage`）

- [ ] **Step 1: 更新命令自述**

`src/commands/ai/ask.ts`：

```ts
  name: 'ask',
  description: '和我聊聊（浏览器本地模型）',
  usage: 'ask [--status] [问题...]\n  ask            进入对话模式，exit 或 Ctrl+D 退出\n  ask <问题>      一次性问答',
```

确认 `man ask` 能读到多行 usage；若 `src/commands/sys/man.ts` 按单行渲染，改成按 `\n` 拆行输出，并在 `man` 的测试里补一条多行 usage 的用例。

- [ ] **Step 2: README**

`## 架构` 的目录表加一行：

```
    src/ui/chat/    对话模式状态机与思考指示器
```

- [ ] **Step 3: about.md 引导**

把现有那段改成提到对话模式：

```
如果你用的是 Chrome 且开了内置模型，输入 `ask` 可以直接和我聊——
那个模型完全跑在你自己的机器上，问题不会发到任何服务器。
```

- [ ] **Step 4: 验证与提交**

Run: `pnpm test && pnpm build && pnpm lint`

```bash
git add -A
git commit -m "docs: ask 对话模式的用法与引导"
```

---

## 完成标准

- [ ] `pnpm lint` 无输出
- [ ] `pnpm test` 全绿，且原有 455 个用例无回归
- [ ] `pnpm exec tsc -b` 无错误
- [ ] `pnpm build` 成功
- [ ] 手动验证（Chrome，已开 `chrome://flags/#prompt-api-for-gemini-nano`）：
  - `ask` 进入模式，提示符变 `ask> `，左侧出现色条
  - 提问后立刻看到旋转指示器，超过 1 秒开始显示秒数
  - 首个 token 到达时指示器消失，文字逐片出现
  - 生成中 Ctrl+C 停在半句并显示「^C 已中断」，仍在模式内
  - 空闲时 Ctrl+C 或 Ctrl+D 或 `exit` 退出，提示符恢复
  - 追问能接上文（例如先问「你会什么」，再问「那个熟练度如何」）
  - 模式内 Tab 无反应；↑/↓ 翻的是本次对话提交过的输入，翻不出 shell 历史
- [ ] 手动验证（非 Chrome 或未开 flag）：`ask` 打印 unsupported 文案且不进入模式
