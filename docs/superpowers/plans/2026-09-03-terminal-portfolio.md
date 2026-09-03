# 终端风格个人主页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯静态的终端风格个人主页，访客通过输入 Linux 命令浏览作者的简历与项目。

**Architecture:** `src/core/` 是零 React 依赖的纯 TypeScript shell 内核（虚拟文件系统、词法/语法分析、管道执行器），能脱离浏览器在 Node 中完整单测；`src/ui/` 是它的 React 渲染前端。所有命令统一实现 `stdin → stdout` 的 `Process` 契约，该契约的流式 IO 设计使未来的 WASM 模块可直接实现它而无需改动内核。

**Tech Stack:** Vite 8 + React 19 + TypeScript 5.9.3 + Vitest 4 + pnpm

**Spec:** `docs/superpowers/specs/2026-09-03-terminal-portfolio-design.md`

## Global Constraints

以下约束适用于每一个任务，不再逐条重复：

- **TypeScript 固定 5.9.3**，禁止升级到 7.x —— typescript-eslint 8.69 的 peer 约束是 `>=4.8.4 <6.1.0`，升级会直接失去 lint 能力。
- **`src/core/**` 与 `src/commands/**` 禁止运行时 import React 或 react-dom。** 唯一例外是 `import type { ReactNode } from 'react'`（类型导入，编译后完全擦除，不产生运行时依赖）。由 Task 1 配置的 eslint `no-restricted-imports` + `allowTypeImports` 规则机械强制。
- **每个 `node` 类型的 Chunk 必须提供 `toText()`**，它是必填字段而非可选优化。缺失会导致管道下游崩溃。
- **命令永不允许把异常抛到 UI 层。** executor 兜底捕获所有异常，转为 exit code 1 + stderr 输出。任何命令崩溃都不得白屏。
- **一命令一文件**，放在 `src/commands/<分类>/<命令名>.ts`。
- 不引入 UI 组件库，不引入 CSS-in-JS。样式用原生 CSS + CSS 变量。
- 测试默认在 node 环境运行；需要 DOM 的测试文件首行加 `// @vitest-environment jsdom`。
- 提交信息前缀：`feat:` / `fix:` / `test:` / `chore:` / `docs:`。每个任务至少一次提交。

## 与 Spec 的偏离

一处，已确认：spec §5 的 `Ctx` 缺少 `lastExitCode` 与 `history` 字段，但 §8.1 要求支持 `$?`、§15 要求 `history` 命令。本计划的 `Ctx` 补上这两个字段（见 Task 1）。

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/core/process.ts` | 全部核心契约类型 + chunk 构造器。所有其他模块的依赖根。 |
| `src/core/pipe.ts` | `createPipe()`：连接上下游进程的异步 chunk 队列。 |
| `src/core/registry.ts` | 命令注册表，支持运行时注册（WASM 预留点）。 |
| `src/core/vfs/path.ts` | 纯字符串路径运算，不碰文件树。 |
| `src/core/vfs/vfs.ts` | inode 树的增删改查，抛 `VfsError`。 |
| `src/core/vfs/bootstrap.ts` | 由文本记录构建初始文件树。不依赖 Vite。 |
| `src/core/shell/lexer.ts` | 字符串 → Token[]，处理引号与转义。 |
| `src/core/shell/parser.ts` | Token[] → AST，处理管道/重定向/列表。 |
| `src/core/shell/env.ts` | 环境变量表。 |
| `src/core/shell/expand.ts` | 变量展开、`~` 展开、glob 求值。 |
| `src/core/shell/executor.ts` | 执行 AST，串联管道，处理重定向与退出码。 |
| `src/core/kernel.ts` | 对外门面：`run(line)` 与 `complete(line)`。UI 只认识这一个模块。 |
| `src/commands/**` | 内置命令，一命令一文件。 |
| `src/content/**` | Markdown 与 JSON 内容源。改简历只动这里。 |
| `src/ui/**` | React 渲染层。 |
| `src/seo/renderStaticResume.ts` | 纯函数：内容 → 语义化 HTML 字符串。无 React。 |
| `src/seo/vite-plugin-static-resume.ts` | 构建时把上述 HTML 注入 index.html。 |

---

### Task 1: 工程骨架与核心契约

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`
- Create: `src/core/process.ts`
- Test: `src/core/process.test.ts`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `Style`, `Chunk`, `Writer`, `IO`, `Host`, `Ctx`, `Process`, `Env`, `Registry`, `VFS`（前向声明）；运行时构造器 `text(s, style?)`, `line(s, style?)`, `node(n, toText)`

- [ ] **Step 1: 初始化依赖**

在仓库根目录执行（目录已有 `.git` 与 `docs/`，不要用 `pnpm create vite` 覆盖）：

```bash
pnpm init
pnpm add react react-dom
pnpm add -D typescript@5.9.3 vite @vitejs/plugin-react vitest jsdom \
  @types/react @types/react-dom @eslint/js eslint typescript-eslint \
  eslint-plugin-react-hooks @testing-library/react @testing-library/dom
```

`typescript@5.9.3` 必须精确固定，其余取最新。

- [ ] **Step 2: 写配置文件**

`package.json` 的 `scripts` 与 `type` 字段改为：

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  }
}
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`noUncheckedIndexedAccess: true` 是刻意的：VFS 与词法分析大量做数组下标访问，这个开关会强制处理越界。

`vite.config.ts`：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
})
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

默认 node 环境；需要 DOM 的测试文件首行写 `// @vitest-environment jsdom` 单独切换。不用 `projects` 配置，避免版本差异。

`eslint.config.js`：

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // 架构边界的机械强制：core 与 commands 不得运行时依赖 React
    files: ['src/core/**/*.ts', 'src/commands/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [
          { name: 'react', allowTypeImports: true,
            message: 'core/commands 是纯 TS 层，只允许 import type { ReactNode } from "react"。' },
          { name: 'react-dom', allowTypeImports: true,
            message: 'core/commands 不得依赖 react-dom。' },
        ],
      }],
    },
  },
)
```

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>terminal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 写核心契约**

`src/core/process.ts`：

```ts
import type { ReactNode } from 'react'

export type Style = {
  color?: string      // 语义色名（'red' | 'green' | 'blue' | 'dim' ...），映射到主题 CSS 变量
  bold?: boolean
  dim?: boolean
  underline?: boolean
}

export type Chunk =
  | { type: 'text'; text: string; style?: Style }
  | { type: 'node'; node: ReactNode; toText: () => string }

export interface Writer {
  write(chunk: Chunk): void
  writeText(text: string, style?: Style): void
  writeLine(text: string, style?: Style): void
  close(): void
}

export interface IO {
  argv: string[]
  stdin: AsyncIterable<Chunk> | null
  stdout: Writer
  stderr: Writer
}

export interface Host {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
}

export interface Env {
  get(name: string): string | undefined
  set(name: string, value: string): void
  unset(name: string): void
  all(): Record<string, string>
}

export interface Registry {
  register(p: Process): void
  get(name: string): Process | undefined
  list(): Process[]
}

export interface Ctx {
  cwd: string                    // 可变：cd 修改它
  lastExitCode: number           // 可变：$? 读取它
  history: string[]              // 可变：history 命令读取它
  readonly env: Env
  readonly vfs: unknown          // Task 5 建好 vfs.ts 后改为 VFS，见下方说明
  readonly registry: Registry
  readonly host: Host
  readonly signal: AbortSignal   // Ctrl+C
}

export interface Process {
  name: string
  description: string
  usage?: string
  complete?(argv: string[], ctx: Ctx): string[]
  run(io: IO, ctx: Ctx): Promise<number>
}

// ---- chunk 构造器 ----

export function text(s: string, style?: Style): Chunk {
  return style ? { type: 'text', text: s, style } : { type: 'text', text: s }
}

export function line(s: string, style?: Style): Chunk {
  return text(s + '\n', style)
}

export function node(n: ReactNode, toText: () => string): Chunk {
  return { type: 'node', node: n, toText }
}

/** 把任意 chunk 降级为纯文本 —— 管道与重定向的下游只认文本。 */
export function chunkToText(c: Chunk): string {
  return c.type === 'text' ? c.text : c.toText()
}
```

VFS 要到 Task 5 才存在，所以这里 `Ctx.vfs` 先写成 `unknown`，也先不导出 VFS 类型。Task 5 的 Step 5 会把这两处一并换成真实类型。

- [ ] **Step 4: 写失败的测试**

`src/core/process.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { text, line, node, chunkToText } from './process'

describe('chunk 构造器', () => {
  it('text 产生不带换行的文本 chunk', () => {
    expect(text('hi')).toEqual({ type: 'text', text: 'hi' })
  })

  it('传入 style 时才带 style 字段', () => {
    expect(text('hi', { bold: true })).toEqual({
      type: 'text', text: 'hi', style: { bold: true },
    })
  })

  it('line 在末尾补一个换行', () => {
    expect(line('hi')).toEqual({ type: 'text', text: 'hi\n' })
  })

  it('node chunk 携带降级文本', () => {
    const c = node(null, () => 'fallback')
    expect(c.type).toBe('node')
    expect(chunkToText(c)).toBe('fallback')
  })

  it('chunkToText 对文本 chunk 原样返回', () => {
    expect(chunkToText(text('raw'))).toBe('raw')
  })
})
```

- [ ] **Step 5: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL —— 报找不到 `./process` 的导出，或类型错误。

- [ ] **Step 6: 补齐骨架文件让测试通过**

`src/main.tsx`：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

`src/App.tsx`：

```tsx
export default function App() {
  return <div>terminal</div>
}
```

`src/styles/global.css`：

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { background: #16161e; color: #c0caf5; }
```

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm test`
Expected: PASS，5 个测试全绿。

- [ ] **Step 8: 验证架构边界的 lint 规则真的生效**

这一步是在验证 Global Constraints 的机械强制，不能跳过。

```bash
printf "import { useState } from 'react'\nexport const x = useState\n" > src/core/__boundary_probe.ts
pnpm lint
```

Expected: 报错 `core/commands 是纯 TS 层，只允许 import type ...`。

确认报错后删除探针文件并复查：

```bash
rm src/core/__boundary_probe.ts
pnpm lint
```

Expected: 无错误。若第一次没报错，说明 eslint 配置没生效，必须先修好再继续 —— 后面 26 个任务都依赖这条边界。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: 工程骨架与核心进程契约"
```

---

### Task 2: pipe —— 连接进程的异步管道

**Files:**
- Create: `src/core/pipe.ts`
- Test: `src/core/pipe.test.ts`

**Interfaces:**
- Consumes: `Chunk`, `Writer`, `text`, `line`（Task 1）
- Produces: `createPipe(): { writer: Writer; reader: AsyncIterable<Chunk> }`

- [ ] **Step 1: 写失败的测试**

`src/core/pipe.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { createPipe } from './pipe'
import type { Chunk } from './process'

async function drain(reader: AsyncIterable<Chunk>): Promise<string[]> {
  const out: string[] = []
  for await (const c of reader) if (c.type === 'text') out.push(c.text)
  return out
}

describe('createPipe', () => {
  it('按写入顺序传递 chunk', async () => {
    const { writer, reader } = createPipe()
    writer.writeText('a')
    writer.writeText('b')
    writer.close()
    expect(await drain(reader)).toEqual(['a', 'b'])
  })

  it('close 使迭代终止', async () => {
    const { writer, reader } = createPipe()
    writer.close()
    expect(await drain(reader)).toEqual([])
  })

  it('消费者先于生产者到达时会等待', async () => {
    const { writer, reader } = createPipe()
    const collected = drain(reader)
    // 让消费者先进入等待状态
    await new Promise(r => setTimeout(r, 0))
    writer.writeText('late')
    writer.close()
    expect(await collected).toEqual(['late'])
  })

  it('writeLine 补换行', async () => {
    const { writer, reader } = createPipe()
    writer.writeLine('x')
    writer.close()
    expect(await drain(reader)).toEqual(['x\n'])
  })

  it('close 之后再写入抛错', () => {
    const { writer } = createPipe()
    writer.close()
    expect(() => writer.writeText('nope')).toThrow(/write after close/)
  })

  it('重复 close 是幂等的', () => {
    const { writer } = createPipe()
    writer.close()
    expect(() => writer.close()).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/pipe.test.ts`
Expected: FAIL —— `Cannot find module './pipe'`。

- [ ] **Step 3: 实现**

`src/core/pipe.ts`：

```ts
import { text, line, type Chunk, type Writer } from './process'

/**
 * 单生产者单消费者的异步 chunk 队列。
 * 不用 Web Streams：其背压与锁定语义在本场景无用，且难以单测。
 */
export function createPipe(): { writer: Writer; reader: AsyncIterable<Chunk> } {
  const queue: Chunk[] = []
  let closed = false
  let wake: (() => void) | null = null

  const notify = () => {
    const w = wake
    wake = null
    w?.()
  }

  const writer: Writer = {
    write(chunk: Chunk) {
      if (closed) throw new Error('write after close')
      queue.push(chunk)
      notify()
    },
    writeText(s: string, style?) {
      writer.write(text(s, style))
    },
    writeLine(s: string, style?) {
      writer.write(line(s, style))
    },
    close() {
      if (closed) return
      closed = true
      notify()
    },
  }

  const reader: AsyncIterable<Chunk> = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length > 0) {
          yield queue.shift()!
        }
        if (closed) return
        await new Promise<void>(resolve => { wake = resolve })
      }
    },
  }

  return { writer, reader }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/core/pipe.test.ts`
Expected: PASS，6 个测试全绿。

- [ ] **Step 5: 提交**

```bash
git add src/core/pipe.ts src/core/pipe.test.ts
git commit -m "feat: 实现进程间异步管道"
```

---

### Task 3: registry —— 命令注册表

这是本期为 WASM 付出的第二笔预留成本：注册必须支持运行时调用，而不只是构建时的静态表。

**Files:**
- Create: `src/core/registry.ts`
- Test: `src/core/registry.test.ts`

**Interfaces:**
- Consumes: `Process`, `Registry`（Task 1）
- Produces: `createRegistry(): Registry`

- [ ] **Step 1: 写失败的测试**

`src/core/registry.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { createRegistry } from './registry'
import type { Process } from './process'

const stub = (name: string): Process => ({
  name,
  description: `stub ${name}`,
  async run() { return 0 },
})

describe('createRegistry', () => {
  it('注册后可按名取回', () => {
    const r = createRegistry()
    const p = stub('ls')
    r.register(p)
    expect(r.get('ls')).toBe(p)
  })

  it('未注册的名字返回 undefined', () => {
    expect(createRegistry().get('nope')).toBeUndefined()
  })

  it('list 按名称字典序排列', () => {
    const r = createRegistry()
    r.register(stub('whoami'))
    r.register(stub('cat'))
    r.register(stub('ls'))
    expect(r.list().map(p => p.name)).toEqual(['cat', 'ls', 'whoami'])
  })

  it('同名重复注册后者覆盖前者', () => {
    const r = createRegistry()
    r.register(stub('ls'))
    const second = stub('ls')
    r.register(second)
    expect(r.get('ls')).toBe(second)
    expect(r.list()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/registry.test.ts`
Expected: FAIL —— `Cannot find module './registry'`。

- [ ] **Step 3: 实现**

`src/core/registry.ts`：

```ts
import type { Process, Registry } from './process'

export function createRegistry(): Registry {
  const map = new Map<string, Process>()
  return {
    register(p: Process) {
      map.set(p.name, p)
    },
    get(name: string) {
      return map.get(name)
    },
    list() {
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/core/registry.test.ts`
Expected: PASS，4 个测试全绿。

- [ ] **Step 5: 提交**

```bash
git add src/core/registry.ts src/core/registry.test.ts
git commit -m "feat: 支持运行时注册的命令注册表"
```

---
### Task 4: 路径运算

纯字符串运算，不接触文件树。单独成任务是因为 `..` 的边界行为是后续 VFS 全部正确性的地基。

**Files:**
- Create: `src/core/vfs/path.ts`
- Test: `src/core/vfs/path.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `isAbsolute(p)`, `normalize(p)`, `join(...parts)`, `dirname(p)`, `basename(p)` —— 全部 `(string) => string`（`join` 为 `(...string[]) => string`）

- [ ] **Step 1: 写失败的测试**

`src/core/vfs/path.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { isAbsolute, normalize, join, dirname, basename } from './path'

describe('isAbsolute', () => {
  it('以斜杠开头即绝对路径', () => {
    expect(isAbsolute('/a')).toBe(true)
    expect(isAbsolute('a')).toBe(false)
  })
})

describe('normalize', () => {
  it('解析 ..', () => {
    expect(normalize('/a/b/../c')).toBe('/a/c')
  })

  it('.. 越过根时停在根', () => {
    expect(normalize('/../..')).toBe('/')
    expect(normalize('/a/../../..')).toBe('/')
  })

  it('丢弃 . 与空段', () => {
    expect(normalize('/a/./b')).toBe('/a/b')
    expect(normalize('/a//b')).toBe('/a/b')
  })

  it('去掉尾斜杠，但根保留', () => {
    expect(normalize('/a/b/')).toBe('/a/b')
    expect(normalize('/')).toBe('/')
  })

  it('相对路径保留前导 ..', () => {
    expect(normalize('../a')).toBe('../a')
    expect(normalize('a/../..')).toBe('..')
  })

  it('空串归一为当前目录', () => {
    expect(normalize('')).toBe('.')
  })
})

describe('join', () => {
  it('拼接 cwd 与相对路径', () => {
    expect(join('/home/guest', 'projects')).toBe('/home/guest/projects')
  })

  it('拼接后解析 ..', () => {
    expect(join('/home/guest', '../etc')).toBe('/home/etc')
  })

  it('忽略空段', () => {
    expect(join('/home', '', 'guest')).toBe('/home/guest')
  })
})

describe('dirname', () => {
  it('返回父目录', () => {
    expect(dirname('/a/b')).toBe('/a')
  })

  it('一级路径的父目录是根', () => {
    expect(dirname('/a')).toBe('/')
  })

  it('根的父目录是自己', () => {
    expect(dirname('/')).toBe('/')
  })
})

describe('basename', () => {
  it('返回最后一段', () => {
    expect(basename('/a/b')).toBe('b')
    expect(basename('/a/b/')).toBe('b')
  })

  it('根的 basename 是自己', () => {
    expect(basename('/')).toBe('/')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/vfs/path.test.ts`
Expected: FAIL —— `Cannot find module './path'`。

- [ ] **Step 3: 实现**

`src/core/vfs/path.ts`：

```ts
export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}

export function normalize(p: string): string {
  const abs = isAbsolute(p)
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      const last = out[out.length - 1]
      if (out.length > 0 && last !== '..') out.pop()
      else if (!abs) out.push('..')       // 相对路径保留前导 ..，绝对路径在根处吞掉
      continue
    }
    out.push(seg)
  }
  if (abs) return '/' + out.join('/')
  return out.length > 0 ? out.join('/') : '.'
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(p => p !== '').join('/'))
}

export function dirname(p: string): string {
  const n = normalize(p)
  if (n === '/') return '/'
  const i = n.lastIndexOf('/')
  if (i < 0) return '.'
  return i === 0 ? '/' : n.slice(0, i)
}

export function basename(p: string): string {
  const n = normalize(p)
  if (n === '/') return '/'
  const i = n.lastIndexOf('/')
  return i < 0 ? n : n.slice(i + 1)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/core/vfs/path.test.ts`
Expected: PASS，全部通过。特别确认 `normalize('/../..') === '/'` 这条 —— 它防止访客用 `cd ../../..` 越出虚拟根。

- [ ] **Step 5: 提交**

```bash
git add src/core/vfs/path.ts src/core/vfs/path.test.ts
git commit -m "feat: 虚拟文件系统的路径运算"
```

---

### Task 5: 虚拟文件系统

**Files:**
- Create: `src/core/vfs/vfs.ts`
- Modify: `src/core/process.ts`（把 Task 1 留下的 `readonly vfs: unknown` 换成真实类型）
- Test: `src/core/vfs/vfs.test.ts`

**Interfaces:**
- Consumes: `normalize`, `join`, `dirname`, `basename`, `isAbsolute`（Task 4）
- Produces:
  - 类型 `FileInode`, `DirInode`, `Inode`, `VfsErrorCode`, `VFS`
  - 类 `VfsError`（字段 `code: VfsErrorCode`, `path: string`）
  - `emptyDir(name: string, mtime?: number): DirInode`
  - `createVfs(root: DirInode, now?: () => number): VFS`
  - `VFS` 方法：`resolve(cwd, p)`, `stat(abs)`, `isDir(abs)`, `readFile(abs)`, `writeFile(abs, content)`, `appendFile(abs, content)`, `list(abs)`, `mkdir(abs, recursive)`, `remove(abs, recursive)`, `touch(abs)`

`now` 参数是为了让 mtime 在测试中可确定，生产环境用默认的 `Date.now`。

- [ ] **Step 1: 写失败的测试**

`src/core/vfs/vfs.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createVfs, emptyDir, VfsError, type VfsErrorCode, type VFS } from './vfs'

/**
 * 断言抛出的是带指定 code 的 VfsError。
 * 不用 toThrowError(expect.objectContaining(...)) —— 非对称匹配器在 toThrow 上的
 * 支持随版本而变，显式写更稳。
 */
function expectVfsError(fn: () => unknown, code: VfsErrorCode) {
  let thrown: unknown
  try { fn() } catch (e) { thrown = e }
  expect(thrown, `期望抛出 VfsError(${code})，但没有抛出`).toBeInstanceOf(VfsError)
  expect((thrown as VfsError).code).toBe(code)
}

let vfs: VFS

beforeEach(() => {
  vfs = createVfs(emptyDir('/', 1000), () => 2000)
  vfs.mkdir('/home/guest', true)
  vfs.writeFile('/home/guest/about.md', 'hello')
})

describe('resolve', () => {
  it('相对路径按 cwd 解析', () => {
    expect(vfs.resolve('/home/guest', 'about.md')).toBe('/home/guest/about.md')
  })

  it('绝对路径忽略 cwd', () => {
    expect(vfs.resolve('/home/guest', '/etc')).toBe('/etc')
  })
})

describe('stat / isDir', () => {
  it('文件存在时返回 file inode', () => {
    expect(vfs.stat('/home/guest/about.md')?.kind).toBe('file')
  })

  it('不存在时返回 null', () => {
    expect(vfs.stat('/nope')).toBeNull()
  })

  it('根始终是目录', () => {
    expect(vfs.isDir('/')).toBe(true)
  })

  it('路径中间段是文件时 isDir 返回 false 而不是抛异常', () => {
    expect(vfs.isDir('/home/guest/about.md/nope')).toBe(false)
  })

  it('路径中间段是文件时 stat 返回 null', () => {
    expect(vfs.stat('/home/guest/about.md/nope')).toBeNull()
  })
})

describe('readFile', () => {
  it('读回写入的内容', () => {
    expect(vfs.readFile('/home/guest/about.md')).toBe('hello')
  })

  it('文件不存在抛 ENOENT', () => {
    expectVfsError(() => vfs.readFile('/nope'), 'ENOENT')
  })

  it('读目录抛 EISDIR', () => {
    expectVfsError(() => vfs.readFile('/home'), 'EISDIR')
  })
})

describe('writeFile', () => {
  it('覆盖已有文件并更新 mtime', () => {
    vfs.writeFile('/home/guest/about.md', 'new')
    const st = vfs.stat('/home/guest/about.md')
    expect(st).toMatchObject({ kind: 'file', content: 'new', mtime: 2000 })
  })

  it('父目录不存在抛 ENOENT', () => {
    expectVfsError(() => vfs.writeFile('/no/such/f.txt', 'x'), 'ENOENT')
  })

  it('目标是目录时抛 EISDIR', () => {
    expectVfsError(() => vfs.writeFile('/home', 'x'), 'EISDIR')
  })
})

describe('appendFile', () => {
  it('追加到已有内容之后', () => {
    vfs.appendFile('/home/guest/about.md', ' world')
    expect(vfs.readFile('/home/guest/about.md')).toBe('hello world')
  })

  it('文件不存在时创建', () => {
    vfs.appendFile('/home/guest/new.txt', 'x')
    expect(vfs.readFile('/home/guest/new.txt')).toBe('x')
  })
})

describe('list', () => {
  it('按名称字典序返回子节点', () => {
    vfs.writeFile('/home/guest/z.md', '')
    vfs.writeFile('/home/guest/a.md', '')
    expect(vfs.list('/home/guest').map(i => i.name)).toEqual(['a.md', 'about.md', 'z.md'])
  })

  it('列出文件抛 ENOTDIR', () => {
    expectVfsError(() => vfs.list('/home/guest/about.md'), 'ENOTDIR')
  })

  it('列出不存在的路径抛 ENOENT', () => {
    expectVfsError(() => vfs.list('/nope'), 'ENOENT')
  })
})

describe('mkdir', () => {
  it('recursive 时创建多级目录', () => {
    vfs.mkdir('/a/b/c', true)
    expect(vfs.isDir('/a/b/c')).toBe(true)
  })

  it('非 recursive 且父目录缺失时抛 ENOENT', () => {
    expectVfsError(() => vfs.mkdir('/a/b/c', false), 'ENOENT')
  })

  it('目标已存在时抛 EEXIST', () => {
    expectVfsError(() => vfs.mkdir('/home', false), 'EEXIST')
  })

  it('recursive 时目标已存在不报错', () => {
    expect(() => vfs.mkdir('/home', true)).not.toThrow()
  })
})

describe('remove', () => {
  it('删除文件', () => {
    vfs.remove('/home/guest/about.md', false)
    expect(vfs.stat('/home/guest/about.md')).toBeNull()
  })

  it('非 recursive 删除非空目录抛 ENOTEMPTY', () => {
    expectVfsError(() => vfs.remove('/home/guest', false), 'ENOTEMPTY')
  })

  it('recursive 时删除整棵子树', () => {
    vfs.remove('/home', true)
    expect(vfs.stat('/home')).toBeNull()
  })

  it('拒绝删除根，抛 EPERM', () => {
    expectVfsError(() => vfs.remove('/', true), 'EPERM')
  })

  it('删除不存在的路径抛 ENOENT', () => {
    expectVfsError(() => vfs.remove('/nope', false), 'ENOENT')
  })
})

describe('touch', () => {
  it('不存在则创建空文件', () => {
    vfs.touch('/home/guest/t.txt')
    expect(vfs.readFile('/home/guest/t.txt')).toBe('')
  })

  it('已存在则只更新 mtime，不清空内容', () => {
    vfs.touch('/home/guest/about.md')
    expect(vfs.readFile('/home/guest/about.md')).toBe('hello')
    expect(vfs.stat('/home/guest/about.md')?.mtime).toBe(2000)
  })
})

describe('VfsError', () => {
  it('携带 code 与 path', () => {
    const e = new VfsError('ENOENT', '/x')
    expect(e.code).toBe('ENOENT')
    expect(e.path).toBe('/x')
    expect(e).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/vfs/vfs.test.ts`
Expected: FAIL —— `Cannot find module './vfs'`。

- [ ] **Step 3: 实现**

`src/core/vfs/vfs.ts`：

```ts
import { basename, dirname, isAbsolute, join, normalize } from './path'

export type FileInode = { kind: 'file'; name: string; content: string; mtime: number }
export type DirInode = { kind: 'dir'; name: string; children: Map<string, Inode>; mtime: number }
export type Inode = FileInode | DirInode

export type VfsErrorCode =
  | 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY' | 'EEXIST' | 'EPERM'

export class VfsError extends Error {
  constructor(readonly code: VfsErrorCode, readonly path: string) {
    super(`${code}: ${path}`)
    this.name = 'VfsError'
  }
}

export interface VFS {
  resolve(cwd: string, p: string): string
  stat(abs: string): Inode | null
  isDir(abs: string): boolean
  readFile(abs: string): string
  writeFile(abs: string, content: string): void
  appendFile(abs: string, content: string): void
  list(abs: string): Inode[]
  mkdir(abs: string, recursive: boolean): void
  remove(abs: string, recursive: boolean): void
  touch(abs: string): void
}

export function emptyDir(name: string, mtime = 0): DirInode {
  return { kind: 'dir', name, children: new Map(), mtime }
}

export function createVfs(root: DirInode, now: () => number = Date.now): VFS {
  /** 沿路径下行；任何中间段不是目录即 ENOTDIR，缺失即返回 null。 */
  function lookup(abs: string): Inode | null {
    const n = normalize(abs)
    if (n === '/') return root
    let cur: Inode = root
    for (const seg of n.split('/').filter(Boolean)) {
      if (cur.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
      const next = cur.children.get(seg)
      if (!next) return null
      cur = next
    }
    return cur
  }

  function mustDir(abs: string): DirInode {
    const it = lookup(abs)
    if (!it) throw new VfsError('ENOENT', abs)
    if (it.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
    return it
  }

  return {
    resolve(cwd, p) {
      return isAbsolute(p) ? normalize(p) : join(cwd, p)
    },

    stat(abs) {
      try {
        return lookup(abs)
      } catch {
        return null            // 中间段不是目录，视作不存在
      }
    },

    isDir(abs) {
      // 与 stat 一致：查询类方法不抛异常。中间段是文件时，它当然不是目录。
      try {
        return lookup(abs)?.kind === 'dir'
      } catch {
        return false
      }
    },

    readFile(abs) {
      const it = lookup(abs)
      if (!it) throw new VfsError('ENOENT', abs)
      if (it.kind === 'dir') throw new VfsError('EISDIR', abs)
      return it.content
    },

    writeFile(abs, content) {
      const n = normalize(abs)
      const existing = lookup(n)
      if (existing?.kind === 'dir') throw new VfsError('EISDIR', abs)
      const parent = mustDir(dirname(n))
      const name = basename(n)
      parent.children.set(name, { kind: 'file', name, content, mtime: now() })
      parent.mtime = now()
    },

    appendFile(abs, content) {
      const existing = lookup(normalize(abs))
      if (existing?.kind === 'dir') throw new VfsError('EISDIR', abs)
      const prev = existing?.kind === 'file' ? existing.content : ''
      this.writeFile(abs, prev + content)
    },

    list(abs) {
      const it = lookup(abs)
      if (!it) throw new VfsError('ENOENT', abs)
      if (it.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
      return [...it.children.values()].sort((a, b) => a.name.localeCompare(b.name))
    },

    mkdir(abs, recursive) {
      const n = normalize(abs)
      if (n === '/') {
        if (recursive) return
        throw new VfsError('EEXIST', abs)
      }
      const existing = lookup(n)
      if (existing) {
        if (recursive && existing.kind === 'dir') return
        throw new VfsError('EEXIST', abs)
      }
      const segs = n.split('/').filter(Boolean)
      let cur: DirInode = root
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]!
        const next = cur.children.get(seg)
        if (!next) {
          const isLast = i === segs.length - 1
          if (!isLast && !recursive) throw new VfsError('ENOENT', abs)
          const made = emptyDir(seg, now())
          cur.children.set(seg, made)
          cur.mtime = now()
          cur = made
          continue
        }
        if (next.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
        cur = next
      }
    },

    remove(abs, recursive) {
      const n = normalize(abs)
      if (n === '/') throw new VfsError('EPERM', abs)
      const it = lookup(n)
      if (!it) throw new VfsError('ENOENT', abs)
      if (it.kind === 'dir' && it.children.size > 0 && !recursive) {
        throw new VfsError('ENOTEMPTY', abs)
      }
      const parent = mustDir(dirname(n))
      parent.children.delete(basename(n))
      parent.mtime = now()
    },

    touch(abs) {
      const it = lookup(normalize(abs))
      if (it?.kind === 'file') {
        it.mtime = now()
        return
      }
      if (it?.kind === 'dir') {
        it.mtime = now()
        return
      }
      this.writeFile(abs, '')
    },
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/core/vfs/vfs.test.ts`
Expected: PASS，全部通过。

- [ ] **Step 5: 把真实 VFS 类型接回 process.ts**

在 `src/core/process.ts` 顶部加：

```ts
import type { VFS } from './vfs/vfs'
```

把 Task 1 中 `Ctx` 里的 `readonly vfs: unknown` 改为 `readonly vfs: VFS`，并在文件末尾加：

```ts
export type { VFS } from './vfs/vfs'
```

- [ ] **Step 6: 全量测试与类型检查**

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`
Expected: 测试全绿，无类型错误，无 lint 错误。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 内存虚拟文件系统"
```

---

### Task 6: 内容源与初始文件树

改简历的日常入口。`src/content/` 下的 Markdown 在构建时被打包进虚拟文件树，改内容不需要动代码。

**Files:**
- Create: `src/core/vfs/bootstrap.ts`
- Create: `src/content/about.md`, `src/content/contact.md`
- Create: `src/content/projects/terminal-site.md`, `src/content/projects/example-project.md`
- Create: `src/content/skills.json`
- Create: `src/content/system.ts`
- Create: `src/content/index.ts`
- Test: `src/core/vfs/bootstrap.test.ts`

**Interfaces:**
- Consumes: `createVfs`, `emptyDir`, `VFS`（Task 5）；`dirname`（Task 4）
- Produces:
  - `buildInitialVfs(files: Record<string, string>, now?: () => number): VFS` —— 键是绝对路径，中间目录自动创建
  - `loadContent(): Record<string, string>`（`src/content/index.ts`，Vite 专用，不被 core 依赖）

**分层理由：** `buildInitialVfs` 收一个普通的 `Record<string, string>`，不认识 `import.meta.glob`。glob 只出现在 `src/content/index.ts`。这样 core 保持可在纯 Node 下测试。

- [ ] **Step 1: 写失败的测试**

`src/core/vfs/bootstrap.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildInitialVfs } from './bootstrap'

describe('buildInitialVfs', () => {
  it('按绝对路径放置文件', () => {
    const vfs = buildInitialVfs({ '/home/guest/about.md': 'hi' })
    expect(vfs.readFile('/home/guest/about.md')).toBe('hi')
  })

  it('自动创建中间目录', () => {
    const vfs = buildInitialVfs({ '/a/b/c/d.txt': 'x' })
    expect(vfs.isDir('/a/b/c')).toBe(true)
  })

  it('多个文件共享父目录', () => {
    const vfs = buildInitialVfs({
      '/home/guest/a.md': '1',
      '/home/guest/b.md': '2',
    })
    expect(vfs.list('/home/guest').map(i => i.name)).toEqual(['a.md', 'b.md'])
  })

  it('空输入产出只有根的树', () => {
    const vfs = buildInitialVfs({})
    expect(vfs.list('/')).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/vfs/bootstrap.test.ts`
Expected: FAIL —— `Cannot find module './bootstrap'`。

- [ ] **Step 3: 实现 bootstrap**

`src/core/vfs/bootstrap.ts`：

```ts
import { createVfs, emptyDir, type VFS } from './vfs'
import { dirname } from './path'

/** 由「绝对路径 → 文件内容」的映射构建初始文件树，中间目录自动创建。 */
export function buildInitialVfs(
  files: Record<string, string>,
  now: () => number = Date.now,
): VFS {
  const vfs = createVfs(emptyDir('/', now()), now)
  for (const [path, content] of Object.entries(files)) {
    const dir = dirname(path)
    if (dir !== '/') vfs.mkdir(dir, true)
    vfs.writeFile(path, content)
  }
  return vfs
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/core/vfs/bootstrap.test.ts`
Expected: PASS，4 个测试全绿。

- [ ] **Step 5: 写内容文件**

以下是**示例内容，作者应替换为自己的真实信息**。结构必须保留（`skills.json` 的字段被 Task 21 的 `skills` 命令读取）。

`src/content/about.md`：

```markdown
# 关于我

全栈工程师，专注于前端架构与开发者工具。

喜欢把复杂的东西做成简单的界面，也喜欢把简单的界面做得有点意思——
比如你现在正在用的这个终端。

- 主要方向：TypeScript / React / Rust / WebAssembly
- 常驻：中国
- 现状：开放合作机会

输入 `projects` 看我做过什么，`skills` 看我会什么，`contact` 找到我。
```

`src/content/contact.md`：

```markdown
# 联系方式

- Email:  mr.web0310@gmail.com
- GitHub: https://github.com/cuixiaohan

邮件我一般在 24 小时内回复。
```

`src/content/projects/terminal-site.md`：

```markdown
# terminal-site

你正在使用的这个网站。

一个纯静态的终端模拟器：虚拟文件系统、管道、重定向、Tab 补全全部在浏览器里实现，
内核是零框架依赖的纯 TypeScript，React 只负责渲染。

- 技术栈：TypeScript, React, Vite
- 源码：https://github.com/cuixiaohan/terminal-site
- 状态：持续维护
```

`src/content/projects/example-project.md`：

```markdown
# example-project

这是一个示例项目条目，用来演示 `projects` 命令如何读取 `src/content/projects/` 目录。

复制这个文件、改掉内容，就能新增一个项目——不需要修改任何代码。

- 技术栈：TypeScript
- 源码：https://github.com/cuixiaohan/example-project
- 状态：示例
```

`src/content/skills.json`：

```json
{
  "groups": [
    {
      "name": "语言",
      "items": [
        { "name": "TypeScript", "level": 5 },
        { "name": "JavaScript", "level": 5 },
        { "name": "Rust", "level": 3 },
        { "name": "Go", "level": 3 }
      ]
    },
    {
      "name": "前端",
      "items": [
        { "name": "React", "level": 5 },
        { "name": "Vite", "level": 4 },
        { "name": "CSS", "level": 4 },
        { "name": "WebAssembly", "level": 3 }
      ]
    },
    {
      "name": "工程",
      "items": [
        { "name": "Node.js", "level": 4 },
        { "name": "Git", "level": 4 },
        { "name": "CI/CD", "level": 3 }
      ]
    }
  ]
}
```

`level` 取值 1–5，Task 21 会把它渲染成条形图。

`src/content/system.ts`（伪造的系统文件，不走 Markdown 管道）：

```ts
export const systemFiles: Record<string, string> = {
  '/etc/motd': [
    'Welcome to terminal-site.',
    '',
    "Type 'help' to see available commands.",
    "Type 'about' if you'd rather just read.",
    '',
  ].join('\n'),

  '/etc/passwd': [
    'root:x:0:0:root:/root:/bin/bash',
    'guest:x:1000:1000:Guest User:/home/guest:/bin/bash',
    '',
  ].join('\n'),

  '/proc/version': 'Linux version 6.6.0-web (browser@wasm) #1 SMP PREEMPT_DYNAMIC\n',

  '/home/guest/.bashrc': [
    '# ~/.bashrc',
    '# 这里什么都没有。真的。',
    '# 但你既然找到了这里，试试 `neofetch`。',
    '',
  ].join('\n'),
}
```

- [ ] **Step 6: 写内容装配层**

`src/content/index.ts`：

```ts
import { systemFiles } from './system'
import skills from './skills.json'

const HOME = '/home/guest'

/** Vite 构建时把 Markdown 内容内联为字符串。此文件是 core 与 Vite 之间的唯一接缝。 */
const markdown = import.meta.glob('./**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function loadContent(): Record<string, string> {
  const files: Record<string, string> = { ...systemFiles }
  for (const [rel, content] of Object.entries(markdown)) {
    // './projects/x.md' -> '/home/guest/projects/x.md'
    files[HOME + rel.slice(1)] = content
  }
  files[`${HOME}/skills.json`] = JSON.stringify(skills, null, 2) + '\n'
  return files
}

export { skills }
```

`tsconfig.json` 需要加 `"resolveJsonModule": true` 才能 import JSON。

- [ ] **Step 7: 验证内容真的被打包进去**

写一个临时脚本确认 glob 生效：

```bash
cat > /tmp/check-content.test.ts <<'EOF'
import { describe, it, expect } from 'vitest'
import { loadContent } from '../src/content/index'

describe('loadContent', () => {
  it('包含 about.md 与项目文件', () => {
    const files = loadContent()
    expect(files['/home/guest/about.md']).toContain('关于我')
    expect(files['/home/guest/projects/terminal-site.md']).toContain('terminal-site')
    expect(files['/etc/motd']).toContain('Welcome')
  })
})
EOF
cp /tmp/check-content.test.ts src/content/index.test.ts
pnpm test src/content/index.test.ts
```

Expected: PASS。保留这个测试文件（它是回归保护：以后有人改错 glob 路径会立刻发现）。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 内容源与初始文件树装配"
```

---
### Task 7: 词法分析

**Files:**
- Create: `src/core/shell/lexer.ts`
- Test: `src/core/shell/lexer.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - 类型 `Quote = 'none' | 'single' | 'double'`
  - `WordPart = { text: string; quote: Quote }`
  - `Word = WordPart[]`
  - `Op = '|' | '>' | '>>' | '2>' | ';' | '&&' | '||'`
  - `Token = { type: 'word'; parts: Word } | { type: 'op'; value: Op }`
  - 类 `ShellSyntaxError extends Error`
  - `lex(input: string): Token[]`

**为什么 word 要分段：** `echo "$HOME"/'$HOME'` 里前半段要展开变量、后半段不能。只有把引号类型记录到段级别，Task 9 的展开阶段才可能正确。这是 shell 实现最常见的错误来源。

- [ ] **Step 1: 写失败的测试**

`src/core/shell/lexer.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { lex, ShellSyntaxError, type Token } from './lexer'

/** 便于断言：把 token 压成可读形式 */
function shape(tokens: Token[]) {
  return tokens.map(t =>
    t.type === 'op' ? `op:${t.value}` : `word:${t.parts.map(p => `${p.quote}(${p.text})`).join('+')}`,
  )
}

describe('lex 基础', () => {
  it('按空白切分单词', () => {
    expect(shape(lex('ls -la'))).toEqual(['word:none(ls)', 'word:none(-la)'])
  })

  it('折叠连续空白', () => {
    expect(shape(lex('  ls   -la  '))).toEqual(['word:none(ls)', 'word:none(-la)'])
  })

  it('空输入产出空 token 列表', () => {
    expect(lex('')).toEqual([])
    expect(lex('   ')).toEqual([])
  })
})

describe('lex 引号', () => {
  it('双引号内空格不切分，且标记为 double', () => {
    expect(shape(lex('echo "hello world"')))
      .toEqual(['word:none(echo)', 'word:double(hello world)'])
  })

  it('单引号标记为 single', () => {
    expect(shape(lex("echo 'a b'")))
      .toEqual(['word:none(echo)', 'word:single(a b)'])
  })

  it('相邻的不同引号拼成同一个单词的多个段', () => {
    expect(shape(lex(`echo a"b"'c'`)))
      .toEqual(['word:none(echo)', 'word:none(a)+double(b)+single(c)'])
  })

  it('空引号也产生一个参数', () => {
    const tokens = lex("echo ''")
    expect(tokens).toHaveLength(2)
    expect(tokens[1]).toEqual({ type: 'word', parts: [{ text: '', quote: 'single' }] })
  })

  it('未闭合的单引号报错', () => {
    expect(() => lex("echo 'abc")).toThrow(ShellSyntaxError)
  })

  it('未闭合的双引号报错', () => {
    expect(() => lex('echo "abc')).toThrow(ShellSyntaxError)
  })
})

describe('lex 转义', () => {
  it('反斜杠转义的字符不参与展开（记为 single）', () => {
    expect(shape(lex('echo a\\ b')))
      .toEqual(['word:none(echo)', 'word:none(a)+single( )+none(b)'])
  })

  it('双引号内 \\$ 转义为字面 $', () => {
    expect(shape(lex('echo "\\$HOME"')))
      .toEqual(['word:none(echo)', 'word:double($HOME)'])
  })

  it('行尾单个反斜杠报错', () => {
    expect(() => lex('echo a\\')).toThrow(ShellSyntaxError)
  })
})

describe('lex 操作符', () => {
  it('识别管道', () => {
    expect(shape(lex('cat a | grep b')))
      .toEqual(['word:none(cat)', 'word:none(a)', 'op:|', 'word:none(grep)', 'word:none(b)'])
  })

  it('区分 > 与 >>', () => {
    expect(shape(lex('echo x > a'))).toContain('op:>')
    expect(shape(lex('echo x >> a'))).toContain('op:>>')
  })

  it('在单词起始处识别 2>', () => {
    expect(shape(lex('cmd 2> err')))
      .toEqual(['word:none(cmd)', 'op:2>', 'word:none(err)'])
  })

  it('单词中间的 2> 不当作重定向', () => {
    expect(shape(lex('file2>out')))
      .toEqual(['word:none(file2)', 'op:>', 'word:none(out)'])
  })

  it('识别 && || ;', () => {
    expect(shape(lex('a && b || c ; d')))
      .toEqual(['word:none(a)', 'op:&&', 'word:none(b)', 'op:||',
                'word:none(c)', 'op:;', 'word:none(d)'])
  })

  it('操作符不需要两侧空格', () => {
    expect(shape(lex('a|b'))).toEqual(['word:none(a)', 'op:|', 'word:none(b)'])
  })

  it('引号内的操作符是普通字符', () => {
    expect(shape(lex('echo "a | b"')))
      .toEqual(['word:none(echo)', 'word:double(a | b)'])
  })

  it('后台任务符号 & 明确不支持', () => {
    expect(() => lex('sleep 1 &')).toThrow(ShellSyntaxError)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/shell/lexer.test.ts`
Expected: FAIL —— `Cannot find module './lexer'`。

- [ ] **Step 3: 实现**

`src/core/shell/lexer.ts`：

```ts
export type Quote = 'none' | 'single' | 'double'
export type WordPart = { text: string; quote: Quote }
export type Word = WordPart[]
export type Op = '|' | '>' | '>>' | '2>' | ';' | '&&' | '||'

export type Token =
  | { type: 'word'; parts: Word }
  | { type: 'op'; value: Op }

export class ShellSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShellSyntaxError'
  }
}

export function lex(input: string): Token[] {
  const tokens: Token[] = []
  let parts: Word = []
  let buf = ''
  let bufQuote: Quote = 'none'
  let touched = false        // 当前单词是否已开始（空引号也算开始）

  const flushPart = () => {
    // bufQuote !== 'none' 也要落段：空的引号（如 ''）没有字符，但仍是一个有效的段。
    // 推入后必须把 bufQuote 一并复位，否则 `echo a b` 会产生多余的空段。
    if (buf !== '' || bufQuote !== 'none') {
      parts.push({ text: buf, quote: bufQuote })
      buf = ''
      bufQuote = 'none'
    }
  }

  const flushWord = () => {
    flushPart()
    if (parts.length > 0 || touched) {
      tokens.push({ type: 'word', parts })
      parts = []
    }
    touched = false
  }

  /** 切换引号语境前必须先把已积累的字符落成一个段 */
  const setQuote = (q: Quote) => {
    if (q !== bufQuote) {
      flushPart()
      bufQuote = q
    }
  }

  let i = 0
  while (i < input.length) {
    const c = input[i]!

    if (c === ' ' || c === '\t') {
      flushWord()
      i++
      continue
    }

    if (c === "'") {
      const end = input.indexOf("'", i + 1)
      if (end < 0) throw new ShellSyntaxError("unexpected EOF while looking for matching `''")
      setQuote('single')
      buf += input.slice(i + 1, end)
      touched = true
      i = end + 1
      continue
    }

    if (c === '"') {
      setQuote('double')
      touched = true
      i++
      let closed = false
      while (i < input.length) {
        const d = input[i]!
        if (d === '\\') {
          const n = input[i + 1]
          if (n === '"' || n === '\\' || n === '$') { buf += n; i += 2; continue }
          buf += '\\'; i++; continue
        }
        if (d === '"') { closed = true; i++; break }
        buf += d
        i++
      }
      if (!closed) throw new ShellSyntaxError('unexpected EOF while looking for matching `"\'')
      continue
    }

    if (c === '\\') {
      const n = input[i + 1]
      if (n === undefined) throw new ShellSyntaxError('unexpected EOF after `\\\'')
      setQuote('single')         // 转义结果不参与后续展开
      buf += n
      touched = true
      i += 2
      continue
    }

    const two = input.slice(i, i + 2)
    if (two === '&&' || two === '||' || two === '>>') {
      flushWord()
      tokens.push({ type: 'op', value: two })
      i += 2
      continue
    }
    if (two === '2>' && !touched) {
      flushWord()
      tokens.push({ type: 'op', value: '2>' })
      i += 2
      continue
    }
    if (c === '&') {
      throw new ShellSyntaxError('后台任务 `&` 不支持')
    }
    if (c === '|' || c === '>' || c === ';') {
      flushWord()
      tokens.push({ type: 'op', value: c })
      i++
      continue
    }

    setQuote('none')
    buf += c
    touched = true
    i++
  }

  flushWord()
  return tokens
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/core/shell/lexer.test.ts`
Expected: PASS，全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/shell/lexer.ts src/core/shell/lexer.test.ts
git commit -m "feat: shell 词法分析"
```

---

### Task 8: 语法分析

**Files:**
- Create: `src/core/shell/parser.ts`
- Test: `src/core/shell/parser.test.ts`

**Interfaces:**
- Consumes: `Token`, `Word`, `ShellSyntaxError`（Task 7）
- Produces:
  - `Redirect = { fd: 1 | 2; mode: 'write' | 'append'; target: Word }`
  - `Command = { argv: Word[]; redirects: Redirect[] }`
  - `Pipeline = { commands: Command[] }`
  - `Item = { pipeline: Pipeline; joinNext: ';' | '&&' | '||' | null }`
  - `Ast = { items: Item[] }`
  - `parse(tokens: Token[]): Ast`

**`joinNext` 的语义：** 它是把**本项连到下一项**的操作符，最后一项为 `null`。executor 据此做短路，比链表结构好走。

- [ ] **Step 1: 写失败的测试**

`src/core/shell/parser.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { lex, ShellSyntaxError, type Word } from './lexer'
import { parse } from './parser'

/** 从 Word 还原字面量，便于断言 */
const flat = (w: Word) => w.map(p => p.text).join('')
const argvOf = (cmd: { argv: Word[] }) => cmd.argv.map(flat)

describe('parse 单命令', () => {
  it('产出一项、一条 pipeline、一个命令', () => {
    const ast = parse(lex('ls -la'))
    expect(ast.items).toHaveLength(1)
    expect(ast.items[0]!.pipeline.commands).toHaveLength(1)
    expect(argvOf(ast.items[0]!.pipeline.commands[0]!)).toEqual(['ls', '-la'])
    expect(ast.items[0]!.joinNext).toBeNull()
  })

  it('空输入产出空 items', () => {
    expect(parse(lex('')).items).toEqual([])
  })
})

describe('parse 管道', () => {
  it('三段管道产出三个命令', () => {
    const ast = parse(lex('cat a | grep b | wc -l'))
    const cmds = ast.items[0]!.pipeline.commands
    expect(cmds.map(argvOf)).toEqual([['cat', 'a'], ['grep', 'b'], ['wc', '-l']])
  })
})

describe('parse 重定向', () => {
  it('> 记为 fd1 write', () => {
    const cmd = parse(lex('echo x > out.txt')).items[0]!.pipeline.commands[0]!
    expect(argvOf(cmd)).toEqual(['echo', 'x'])
    expect(cmd.redirects).toHaveLength(1)
    expect(cmd.redirects[0]!.fd).toBe(1)
    expect(cmd.redirects[0]!.mode).toBe('write')
    expect(flat(cmd.redirects[0]!.target)).toBe('out.txt')
  })

  it('>> 记为 append', () => {
    const cmd = parse(lex('echo x >> out.txt')).items[0]!.pipeline.commands[0]!
    expect(cmd.redirects[0]!.mode).toBe('append')
  })

  it('2> 记为 fd2', () => {
    const cmd = parse(lex('cmd 2> err.txt')).items[0]!.pipeline.commands[0]!
    expect(cmd.redirects[0]!.fd).toBe(2)
  })

  it('重定向可以出现在参数中间', () => {
    const cmd = parse(lex('echo > out.txt hello')).items[0]!.pipeline.commands[0]!
    expect(argvOf(cmd)).toEqual(['echo', 'hello'])
    expect(cmd.redirects).toHaveLength(1)
  })

  it('重定向缺目标时报错', () => {
    expect(() => parse(lex('echo x >'))).toThrow(ShellSyntaxError)
  })
})

describe('parse 命令列表', () => {
  it('记录连接下一项的操作符', () => {
    const ast = parse(lex('a && b || c ; d'))
    expect(ast.items.map(i => i.joinNext)).toEqual(['&&', '||', ';', null])
    expect(ast.items.map(i => argvOf(i.pipeline.commands[0]!))).toEqual([['a'], ['b'], ['c'], ['d']])
  })

  it('末尾的分号是合法的', () => {
    const ast = parse(lex('ls ;'))
    expect(ast.items).toHaveLength(1)
    expect(ast.items[0]!.joinNext).toBe(';')
  })
})

describe('parse 语法错误', () => {
  it('以管道开头', () => {
    expect(() => parse(lex('| ls'))).toThrow(/unexpected token/)
  })

  it('以管道结尾', () => {
    expect(() => parse(lex('ls |'))).toThrow(/unexpected token/)
  })

  it('连续两个管道', () => {
    expect(() => parse(lex('ls || | wc'))).toThrow(/unexpected token/)
  })

  it('以 && 结尾', () => {
    expect(() => parse(lex('ls &&'))).toThrow(/unexpected token/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/shell/parser.test.ts`
Expected: FAIL —— `Cannot find module './parser'`。

- [ ] **Step 3: 实现**

`src/core/shell/parser.ts`：

```ts
import { ShellSyntaxError, type Token, type Word } from './lexer'

export type Redirect = { fd: 1 | 2; mode: 'write' | 'append'; target: Word }
export type Command = { argv: Word[]; redirects: Redirect[] }
export type Pipeline = { commands: Command[] }
export type Item = { pipeline: Pipeline; joinNext: ';' | '&&' | '||' | null }
export type Ast = { items: Item[] }

export function parse(tokens: Token[]): Ast {
  const items: Item[] = []
  let commands: Command[] = []
  let argv: Word[] = []
  let redirects: Redirect[] = []

  const closeCommand = (near: string) => {
    if (argv.length === 0 && redirects.length === 0) {
      throw new ShellSyntaxError(`syntax error near unexpected token \`${near}'`)
    }
    commands.push({ argv, redirects })
    argv = []
    redirects = []
  }

  const closePipeline = (join: Item['joinNext'], near: string) => {
    closeCommand(near)
    items.push({ pipeline: { commands }, joinNext: join })
    commands = []
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!

    if (t.type === 'word') {
      argv.push(t.parts)
      continue
    }

    if (t.value === '|') {
      closeCommand('|')
      continue
    }

    if (t.value === ';' || t.value === '&&' || t.value === '||') {
      closePipeline(t.value, t.value)
      continue
    }

    // 重定向：吃掉下一个 word 作为目标
    const next = tokens[i + 1]
    if (!next || next.type !== 'word') {
      throw new ShellSyntaxError("syntax error near unexpected token `newline'")
    }
    redirects.push({
      fd: t.value === '2>' ? 2 : 1,
      mode: t.value === '>>' ? 'append' : 'write',
      target: next.parts,
    })
    i++
  }

  if (argv.length > 0 || redirects.length > 0 || commands.length > 0) {
    closePipeline(null, 'newline')
  } else if (items.length > 0) {
    // 输入以 && / || 结尾时，那一项已在循环里被 closePipeline 关闭并重置了
    // argv/redirects/commands，上面的条件看不到任何残留 —— 必须单独校验最后一项。
    // 末尾的 `;` 合法（bash 允许），末尾的 `&&` / `||` 不合法（没有下一项可连）。
    const last = items[items.length - 1]!
    if (last.joinNext === '&&' || last.joinNext === '||') {
      throw new ShellSyntaxError("syntax error near unexpected token `newline'")
    }
  }

  return { items }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test src/core/shell/parser.test.ts`
Expected: PASS，全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/core/shell/parser.ts src/core/shell/parser.test.ts
git commit -m "feat: shell 语法分析"
```

---

### Task 9: 环境变量与展开

**Files:**
- Create: `src/core/shell/env.ts`
- Create: `src/core/shell/expand.ts`
- Test: `src/core/shell/env.test.ts`
- Test: `src/core/shell/expand.test.ts`

**Interfaces:**
- Consumes: `Word`（Task 7）、`Ctx`（Task 1）、`dirname`/`basename`（Task 4）、`VFS`（Task 5）
- Produces:
  - `createEnv(initial?: Record<string, string>): Env`
  - `expandWord(word: Word, ctx: Ctx): string[]` —— 一个 word 可能因 glob 展开成多个参数

**已知且刻意的限制**（写进代码注释）：

1. glob 只在整个 word 全部为未引用段时生效，且只对路径的最后一段求值。`ls src/*.ts` 可以，`ls */*.ts` 不可以。
2. glob 无匹配时保留原样，与 bash 默认行为一致。
3. `*` 不匹配以 `.` 开头的隐藏文件，除非模式本身以 `.` 开头。

- [ ] **Step 1: 写失败的测试**

`src/core/shell/env.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { createEnv } from './env'

describe('createEnv', () => {
  it('返回初始值', () => {
    expect(createEnv({ HOME: '/home/guest' }).get('HOME')).toBe('/home/guest')
  })

  it('未设置的变量返回 undefined', () => {
    expect(createEnv().get('NOPE')).toBeUndefined()
  })

  it('set 覆盖已有值', () => {
    const env = createEnv({ A: '1' })
    env.set('A', '2')
    expect(env.get('A')).toBe('2')
  })

  it('unset 移除变量', () => {
    const env = createEnv({ A: '1' })
    env.unset('A')
    expect(env.get('A')).toBeUndefined()
  })

  it('all 返回副本，改它不影响内部状态', () => {
    const env = createEnv({ A: '1' })
    const snapshot = env.all()
    snapshot.A = 'tampered'
    expect(env.get('A')).toBe('1')
  })
})
```

`src/core/shell/expand.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { lex, type Word } from './lexer'
import { parse } from './parser'
import { createEnv } from './env'
import { expandWord } from './expand'
import { buildInitialVfs } from '../vfs/bootstrap'
import { createRegistry } from '../registry'
import type { Ctx, Host } from '../process'

const noopHost: Host = {
  clear() {}, setTheme() {}, listThemes() { return [] }, currentTheme() { return 'x' },
}

let ctx: Ctx

beforeEach(() => {
  ctx = {
    cwd: '/home/guest',
    lastExitCode: 0,
    history: [],
    env: createEnv({ HOME: '/home/guest', USER: 'guest' }),
    vfs: buildInitialVfs({
      '/home/guest/a.md': '', '/home/guest/b.md': '',
      '/home/guest/note.txt': '', '/home/guest/.hidden': '',
      '/home/guest/projects/p.md': '',
    }),
    registry: createRegistry(),
    host: noopHost,
    signal: new AbortController().signal,
  }
})

/** 取出一行命令里第 n 个参数的 Word */
function wordAt(line: string, n: number): Word {
  return parse(lex(line)).items[0]!.pipeline.commands[0]!.argv[n]!
}

describe('变量展开', () => {
  it('展开 $VAR', () => {
    expect(expandWord(wordAt('echo $USER', 1), ctx)).toEqual(['guest'])
  })

  it('展开 ${VAR}', () => {
    expect(expandWord(wordAt('echo ${USER}x', 1), ctx)).toEqual(['guestx'])
  })

  it('未定义的变量展开为空串', () => {
    expect(expandWord(wordAt('echo $NOPE', 1), ctx)).toEqual([''])
  })

  it('展开 $? 为上次退出码', () => {
    ctx.lastExitCode = 42
    expect(expandWord(wordAt('echo $?', 1), ctx)).toEqual(['42'])
  })

  it('双引号内展开变量', () => {
    expect(expandWord(wordAt('echo "hi $USER"', 1), ctx)).toEqual(['hi guest'])
  })

  it('单引号内不展开变量', () => {
    expect(expandWord(wordAt("echo '$USER'", 1), ctx)).toEqual(['$USER'])
  })

  it('同一个单词里引号与非引号段各按各的规则展开', () => {
    expect(expandWord(wordAt(`echo $USER'$USER'`, 1), ctx)).toEqual(['guest$USER'])
  })
})

describe('波浪号展开', () => {
  it('单独的 ~ 展开为 HOME', () => {
    expect(expandWord(wordAt('cd ~', 1), ctx)).toEqual(['/home/guest'])
  })

  it('~/ 前缀展开为 HOME', () => {
    expect(expandWord(wordAt('cat ~/a.md', 1), ctx)).toEqual(['/home/guest/a.md'])
  })

  it('引号内的 ~ 不展开', () => {
    expect(expandWord(wordAt('cat "~"', 1), ctx)).toEqual(['~'])
  })

  it('非前导位置的 ~ 不展开', () => {
    expect(expandWord(wordAt('echo a~b', 1), ctx)).toEqual(['a~b'])
  })
})

describe('glob 展开', () => {
  it('* 匹配当前目录下的多个文件并按字典序排列', () => {
    expect(expandWord(wordAt('ls *.md', 1), ctx)).toEqual(['a.md', 'b.md'])
  })

  it('? 匹配单个字符', () => {
    expect(expandWord(wordAt('ls ?.md', 1), ctx)).toEqual(['a.md', 'b.md'])
  })

  it('带目录前缀的 glob 保留前缀', () => {
    expect(expandWord(wordAt('ls projects/*.md', 1), ctx)).toEqual(['projects/p.md'])
  })

  it('* 不匹配隐藏文件', () => {
    expect(expandWord(wordAt('ls *', 1), ctx)).toEqual(['a.md', 'b.md', 'note.txt', 'projects'])
  })

  it('以 . 开头的模式可以匹配隐藏文件', () => {
    expect(expandWord(wordAt('ls .h*', 1), ctx)).toEqual(['.hidden'])
  })

  it('无匹配时保留模式原样', () => {
    expect(expandWord(wordAt('ls *.rs', 1), ctx)).toEqual(['*.rs'])
  })

  it('引号内的 * 不做 glob', () => {
    expect(expandWord(wordAt('ls "*.md"', 1), ctx)).toEqual(['*.md'])
  })
})

describe('边界', () => {
  it('空引号展开为一个空参数', () => {
    expect(expandWord(wordAt("echo ''", 1), ctx)).toEqual([''])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/shell/`
Expected: FAIL —— 找不到 `./env` 与 `./expand`。

- [ ] **Step 3: 实现 env**

`src/core/shell/env.ts`：

```ts
import type { Env } from '../process'

export function createEnv(initial: Record<string, string> = {}): Env {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    get(name) { return map.get(name) },
    set(name, value) { map.set(name, value) },
    unset(name) { map.delete(name) },
    all() { return Object.fromEntries(map) },   // 副本，外部改动不影响内部
  }
}
```

- [ ] **Step 4: 实现 expand**

`src/core/shell/expand.ts`：

```ts
import type { Ctx } from '../process'
import type { Word } from './lexer'
import { basename, dirname } from '../vfs/path'

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)|\$\?/g

function expandVars(s: string, ctx: Ctx): string {
  return s.replace(VAR_RE, (match, braced?: string, bare?: string) => {
    if (match === '$?') return String(ctx.lastExitCode)
    const name = braced ?? bare!
    return ctx.env.get(name) ?? ''
  })
}

/** 把 glob 模式转成正则。只转义正则元字符，* 和 ? 保留为通配。 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

/**
 * 对路径的最后一段求 glob。
 * 限制（刻意）：只对路径的最后一段求值。'src/*.ts' 可以，跨目录层级的模式不支持。
 */
function glob(pattern: string, ctx: Ctx): string[] {
  const base = basename(pattern)
  if (!/[*?]/.test(base)) return []

  const dir = dirname(pattern)
  const absDir = ctx.vfs.resolve(ctx.cwd, dir === '.' ? '.' : dir)

  let entries
  try {
    entries = ctx.vfs.list(absDir)
  } catch {
    return []
  }

  const re = patternToRegex(base)
  const includeHidden = base.startsWith('.')
  return entries
    .filter(e => (includeHidden || !e.name.startsWith('.')) && re.test(e.name))
    .map(e => (dir === '.' ? e.name : `${dir}/${e.name}`))
    .sort()
}

/**
 * 展开一个 word 为零到多个实参。
 * 顺序：变量展开 → 波浪号展开 → glob。引号段跳过全部三项。
 */
export function expandWord(word: Word, ctx: Ctx): string[] {
  if (word.length === 0) return ['']

  const allUnquoted = word.every(p => p.quote === 'none')

  let s = ''
  for (const part of word) {
    s += part.quote === 'single' ? part.text : expandVars(part.text, ctx)
  }

  if (allUnquoted && (s === '~' || s.startsWith('~/'))) {
    s = (ctx.env.get('HOME') ?? '/') + s.slice(1)
  }

  if (allUnquoted && /[*?]/.test(s)) {
    const matches = glob(s, ctx)
    if (matches.length > 0) return matches      // 无匹配时保留原样，同 bash
  }

  return [s]
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test src/core/shell/`
Expected: PASS，lexer / parser / env / expand 四个文件全绿。

- [ ] **Step 6: 提交**

```bash
git add src/core/shell/env.ts src/core/shell/env.test.ts src/core/shell/expand.ts src/core/shell/expand.test.ts
git commit -m "feat: 环境变量与参数展开"
```

---
### Task 10: 执行器

内核最复杂的一环：串联管道、处理重定向、实现 `&&`/`||` 短路，并保证**任何命令的异常都不会冒泡到 UI**。

**Files:**
- Create: `src/core/errors.ts`
- Create: `src/core/writers.ts`
- Create: `src/core/shell/executor.ts`
- Test: `src/core/shell/executor.test.ts`

**Interfaces:**
- Consumes: `createPipe`（Task 2）、`Ast`/`Command`/`Pipeline`（Task 8）、`expandWord`（Task 9）、`VfsError`（Task 5）
- Produces:
  - `vfsMessage(code: VfsErrorCode): string`
  - `formatError(cmd: string, e: unknown): string`
  - `textOnly(base: Writer): Writer` —— 富节点降级为文本
  - `styled(base: Writer, style: Style): Writer` —— 给无样式 chunk 补默认样式；`close()` 是空操作
  - `fileWriter(vfs: VFS, abs: string, append: boolean): Writer` —— 累积后在 `close()` 落盘
  - `execute(ast: Ast, ctx: Ctx, out: Writer): Promise<number>`

**三个不变量，实现时必须守住：**

1. 管道下游的 stdin 必须在上游 `close()` 后终止 —— 所以 `runCommand` 的 `finally` 里必须关闭它拥有的 writer，否则整个 shell 会挂死。
2. `styled()` 包装的终端 writer 的 `close()` 必须是空操作 —— stderr 关掉终端会导致后续输出全部丢失。
3. 命令抛出的任何异常都在 `runCommand` 内被捕获转成 exit code 1，绝不 rethrow。

- [ ] **Step 1: 写失败的测试**

`src/core/shell/executor.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { lex } from './lexer'
import { parse } from './parser'
import { execute } from './executor'
import { createEnv } from './env'
import { buildInitialVfs } from '../vfs/bootstrap'
import { createRegistry } from '../registry'
import { chunkToText, node, type Chunk, type Ctx, type Host, type Process, type Writer } from '../process'

const noopHost: Host = {
  clear() {}, setTheme() {}, listThemes() { return [] }, currentTheme() { return 'x' },
}

/** 收集输出的终端 writer 替身 */
function collector() {
  const chunks: Chunk[] = []
  const writer: Writer = {
    write(c) { chunks.push(c) },
    writeText(s, style) { chunks.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
    writeLine(s, style) { writer.writeText(s + '\n', style) },
    close() {},
  }
  return { writer, chunks, out: () => chunks.map(chunkToText).join('') }
}

/** 打印固定文本的桩命令 */
const say = (name: string, out: string, code = 0): Process => ({
  name, description: name,
  async run(io) { io.stdout.writeText(out); return code },
})

/** 把 stdin 原样转大写，用于验证管道确实通了 */
const upper: Process = {
  name: 'upper', description: 'upper',
  async run(io) {
    if (!io.stdin) return 1
    for await (const c of io.stdin) io.stdout.writeText(chunkToText(c).toUpperCase())
    return 0
  },
}

let ctx: Ctx

beforeEach(() => {
  const registry = createRegistry()
  registry.register(say('ok', 'ok'))
  registry.register(say('fail', '', 1))
  registry.register(say('hello', 'hello\n'))
  registry.register(upper)
  registry.register({
    name: 'boom', description: 'boom',
    async run() { throw new Error('kaboom') },
  })
  registry.register({
    name: 'warn', description: 'warn',
    async run(io) { io.stderr.writeLine('something went wrong'); return 3 },
  })
  registry.register({
    name: 'rich', description: 'rich',
    async run(io) { io.stdout.write(node(null, () => 'plain-text-form')); return 0 },
  })

  ctx = {
    cwd: '/home/guest', lastExitCode: 0, history: [],
    env: createEnv({ HOME: '/home/guest' }),
    vfs: buildInitialVfs({ '/home/guest/keep.txt': 'old\n' }),
    registry, host: noopHost,
    signal: new AbortController().signal,
  }
})

const run = async (line: string) => {
  const c = collector()
  const code = await execute(parse(lex(line)), ctx, c.writer)
  return { code, out: c.out(), chunks: c.chunks }
}

describe('单命令', () => {
  it('输出写到终端并返回退出码', async () => {
    expect(await run('ok')).toMatchObject({ code: 0, out: 'ok' })
  })

  it('未知命令返回 127 并给出 bash 风格的提示', async () => {
    const r = await run('nosuchcmd')
    expect(r.code).toBe(127)
    expect(r.out).toContain('bash: nosuchcmd: command not found')
  })

  it('命令抛异常时转为退出码 1，异常不外泄', async () => {
    const r = await run('boom')
    expect(r.code).toBe(1)
    expect(r.out).toContain('boom: kaboom')
  })

  it('stderr 默认标红输出到终端', async () => {
    const r = await run('warn')
    expect(r.code).toBe(3)
    expect(r.out).toContain('something went wrong')
    expect(r.chunks.some(c => c.type === 'text' && c.style?.color === 'red')).toBe(true)
  })
})

describe('管道', () => {
  it('上游输出成为下游输入', async () => {
    expect((await run('hello | upper')).out).toBe('HELLO\n')
  })

  it('管道的退出码取最后一个命令', async () => {
    expect((await run('hello | fail')).code).toBe(1)
  })

  it('富节点进入管道时降级为文本', async () => {
    expect((await run('rich | upper')).out).toBe('PLAIN-TEXT-FORM')
  })

  it('富节点直接输出到终端时保持 node 形态', async () => {
    const r = await run('rich')
    expect(r.chunks.some(c => c.type === 'node')).toBe(true)
  })
})

describe('重定向', () => {
  it('> 写入文件且终端无输出', async () => {
    const r = await run('hello > out.txt')
    expect(r.out).toBe('')
    expect(ctx.vfs.readFile('/home/guest/out.txt')).toBe('hello\n')
  })

  it('> 覆盖已有内容', async () => {
    await run('hello > keep.txt')
    expect(ctx.vfs.readFile('/home/guest/keep.txt')).toBe('hello\n')
  })

  it('>> 追加到已有内容', async () => {
    await run('hello >> keep.txt')
    expect(ctx.vfs.readFile('/home/guest/keep.txt')).toBe('old\nhello\n')
  })

  it('2> 捕获 stderr，终端不再显示', async () => {
    const r = await run('warn 2> err.txt')
    expect(r.out).toBe('')
    expect(ctx.vfs.readFile('/home/guest/err.txt')).toBe('something went wrong\n')
  })

  it('父目录不存在时报错而不是静默失败', async () => {
    const r = await run('hello > /no/such/dir/out.txt')
    expect(r.code).toBe(1)
    expect(r.out).toContain('No such file or directory')
  })
})

describe('命令列表与短路', () => {
  it('; 顺序执行两者', async () => {
    expect((await run('hello ; hello')).out).toBe('hello\nhello\n')
  })

  it('&& 在前者失败时跳过后者', async () => {
    expect((await run('fail && hello')).out).toBe('')
  })

  it('&& 在前者成功时执行后者', async () => {
    expect((await run('ok && hello')).out).toBe('okhello\n')
  })

  it('|| 在前者成功时跳过后者', async () => {
    expect((await run('ok || hello')).out).toBe('ok')
  })

  it('|| 在前者失败时执行后者', async () => {
    expect((await run('fail || hello')).out).toBe('hello\n')
  })

  it('短路只跳过本条链，分号后的命令照常执行', async () => {
    expect((await run('fail && ok ; hello')).out).toBe('hello\n')
  })
})

describe('$? 与中断', () => {
  it('执行后更新 ctx.lastExitCode', async () => {
    await run('fail')
    expect(ctx.lastExitCode).toBe(1)
  })

  it('空输入不改变退出码', async () => {
    ctx.lastExitCode = 7
    expect((await run('')).code).toBe(7)
  })

  it('已中断的信号使命令返回 130', async () => {
    const ac = new AbortController()
    ac.abort()
    ctx = { ...ctx, signal: ac.signal }
    expect((await run('ok')).code).toBe(130)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/shell/executor.test.ts`
Expected: FAIL —— 找不到 `./executor`。

- [ ] **Step 3: 实现 errors.ts**

`src/core/errors.ts`：

```ts
import { VfsError, type VfsErrorCode } from './vfs/vfs'

const MESSAGES: Record<VfsErrorCode, string> = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  ENOTEMPTY: 'Directory not empty',
  EEXIST: 'File exists',
  EPERM: 'Operation not permitted',
}

export function vfsMessage(code: VfsErrorCode): string {
  return MESSAGES[code]
}

/** 把任意异常格式化成一行 shell 风格的错误信息。 */
export function formatError(cmd: string, e: unknown): string {
  if (e instanceof VfsError) return `${cmd}: ${e.path}: ${vfsMessage(e.code)}`
  if (e instanceof Error) return `${cmd}: ${e.message}`
  return `${cmd}: ${String(e)}`
}
```

- [ ] **Step 4: 实现 writers.ts**

`src/core/writers.ts`：

```ts
import { text, type Chunk, type Style, type Writer } from './process'
import type { VFS } from './vfs/vfs'

/** 富节点降级为文本。管道与文件的下游只认文本。 */
export function textOnly(base: Writer): Writer {
  const w: Writer = {
    write(c) { base.write(c.type === 'text' ? c : text(c.toText())) },
    writeText(s, style) { w.write(text(s, style)) },
    writeLine(s, style) { w.write(text(s + '\n', style)) },
    close() { base.close() },
  }
  return w
}

/**
 * 给尚无样式的文本 chunk 补上默认样式（stderr 标红）。
 * close() 刻意留空：stderr 绝不能关闭它借用的终端 writer。
 */
export function styled(base: Writer, style: Style): Writer {
  const apply = (c: Chunk): Chunk => (c.type === 'text' && !c.style ? { ...c, style } : c)
  const w: Writer = {
    write(c) { base.write(apply(c)) },
    writeText(s, st) { base.write(apply(text(s, st))) },
    writeLine(s, st) { base.write(apply(text(s + '\n', st))) },
    close() { /* 空操作 —— 见上 */ },
  }
  return w
}

/** 累积全部写入，在 close() 时一次性落盘。 */
export function fileWriter(vfs: VFS, abs: string, append: boolean): Writer {
  let buf = ''
  let closed = false
  const w: Writer = {
    write(c) {
      if (closed) throw new Error('write after close')
      buf += c.type === 'text' ? c.text : c.toText()
    },
    writeText(s) { w.write(text(s)) },
    writeLine(s) { w.write(text(s + '\n')) },
    close() {
      if (closed) return
      closed = true
      if (append) vfs.appendFile(abs, buf)
      else vfs.writeFile(abs, buf)
    },
  }
  return w
}
```

- [ ] **Step 5: 实现 executor.ts**

`src/core/shell/executor.ts`：

```ts
import { createPipe } from '../pipe'
import { formatError, vfsMessage } from '../errors'
import { fileWriter, styled, textOnly } from '../writers'
import { dirname } from '../vfs/path'
import { expandWord } from './expand'
import type { Ast, Command, Pipeline } from './parser'
import type { Chunk, Ctx, Writer } from '../process'

const STDERR_STYLE = { color: 'red' }

export async function execute(ast: Ast, ctx: Ctx, out: Writer): Promise<number> {
  let last = ctx.lastExitCode
  let i = 0
  while (i < ast.items.length) {
    const item = ast.items[i]!
    last = await runPipeline(item.pipeline, ctx, out)
    ctx.lastExitCode = last

    const join = item.joinNext
    if ((join === '&&' && last !== 0) || (join === '||' && last === 0)) {
      i = skipBranch(ast, i)
      continue
    }
    i++
  }
  return last
}

/** 短路：跳过后续由 && / || 串起来的项，直到跨过一个以 ; 或行尾结束的项。 */
function skipBranch(ast: Ast, from: number): number {
  let j = from
  while (j < ast.items.length) {
    const join = ast.items[j]!.joinNext
    if (join !== '&&' && join !== '||') break
    j++
  }
  return j + 1
}

async function runPipeline(pl: Pipeline, ctx: Ctx, out: Writer): Promise<number> {
  const n = pl.commands.length
  const pipes = Array.from({ length: Math.max(0, n - 1) }, () => createPipe())

  // 全部进程并发启动，靠管道的读写自然同步
  const codes = await Promise.all(
    pl.commands.map((cmd, idx) =>
      runCommand(
        cmd,
        ctx,
        idx === 0 ? null : pipes[idx - 1]!.reader,
        idx === n - 1 ? null : pipes[idx]!.writer,
        out,
      ),
    ),
  )
  return codes[n - 1] ?? 0
}

async function runCommand(
  cmd: Command,
  ctx: Ctx,
  stdin: AsyncIterable<Chunk> | null,
  downstream: Writer | null,
  terminal: Writer,
): Promise<number> {
  // toClose 必须先于任何可能抛出的语句建立 —— 否则抛出时下游 stdin 永不终止。
  const toClose: Writer[] = []
  if (downstream) toClose.push(downstream)

  // 永远指向终端的错误出口。重定向可能把 stderr 改到文件，
  // 但「准备阶段失败」和「落盘失败」必须让用户看见。
  const fatalOut = styled(terminal, STDERR_STYLE)

  let stdout: Writer = downstream ? textOnly(downstream) : terminal
  let stderr: Writer = fatalOut

  try {
    // 展开必须在 try 内：它一旦抛出，异常会逃到 UI，且下游 stdin 永久挂起。
    const argv = cmd.argv.flatMap(w => expandWord(w, ctx))
    const name = argv[0]

    for (const r of cmd.redirects) {
      const targets = expandWord(r.target, ctx)
      if (targets.length !== 1) {
        stderr.writeLine('bash: ambiguous redirect')
        return 1
      }
      const raw = targets[0]!
      const abs = ctx.vfs.resolve(ctx.cwd, raw)
      // 先验父目录，否则错误会推迟到 close() 里被吞掉
      if (!ctx.vfs.isDir(dirname(abs))) {
        stderr.writeLine(`bash: ${raw}: ${vfsMessage('ENOENT')}`)
        return 1
      }
      // 目标自身是目录时同样要挡住。fileWriter 直到 close() 才碰 VFS，
      // 而 close() 在 finally 里，那里抛出的 EISDIR 会被吞掉 —— 结果是静默的 exit 0。
      if (ctx.vfs.isDir(abs)) {
        stderr.writeLine(`bash: ${raw}: ${vfsMessage('EISDIR')}`)
        return 1
      }
      const fw = fileWriter(ctx.vfs, abs, r.mode === 'append')
      toClose.push(fw)
      if (r.fd === 1) stdout = fw
      else stderr = fw
    }

    if (name === undefined) return 0        // 只有重定向、没有命令
    if (ctx.signal.aborted) return 130

    const proc = ctx.registry.get(name)
    if (!proc) {
      stderr.writeLine(`bash: ${name}: command not found`)
      return 127
    }

    try {
      return await proc.run({ argv, stdin, stdout, stderr }, ctx)
    } catch (e) {
      // 兜底：命令的任何异常都不允许冒泡到 UI
      stderr.writeLine(formatError(name, e))
      return 1
    }
  } catch (e) {
    // 展开或重定向准备阶段抛出 —— 绝不允许逃到 UI
    fatalOut.writeLine(formatError('bash', e))
    return 1
  } finally {
    // 必须关闭，否则下游进程的 stdin 永远等不到结束
    for (const w of toClose) {
      try {
        w.close()
      } catch (e) {
        // 落盘失败不能静默丢弃，否则用户看到 exit 0 却什么都没发生
        fatalOut.writeLine(formatError('bash', e))
      }
    }
  }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm test src/core/shell/executor.test.ts`
Expected: PASS，全部通过。若 `hello | upper` 一测挂起不返回，说明 `finally` 里的 `close()` 没生效 —— 那是上面第 1 条不变量被破坏。

- [ ] **Step 7: 提交**

```bash
git add src/core/errors.ts src/core/writers.ts src/core/shell/executor.ts src/core/shell/executor.test.ts
git commit -m "feat: 管道执行器与重定向"
```

---

### Task 11: 内核门面与路径补全

UI 只认识这一个模块。此任务完成后，整个 shell 内核在没有任何真实命令、没有任何 React 代码的情况下已可端到端工作。

**Files:**
- Create: `src/core/complete.ts`
- Create: `src/core/kernel.ts`
- Test: `src/core/kernel.test.ts`

**Interfaces:**
- Consumes: Task 1–10 全部
- Produces:
  - `completePath(frag: string, ctx: Ctx, opts?: { dirsOnly?: boolean }): string[]`
  - `Kernel` 接口：`ctx`、`run(line, out, signal)`、`complete(line)`、`prompt()`
  - `createKernel(opts: { vfs: VFS; host: Host; commands?: Process[]; env?: Record<string, string> }): Kernel`

`complete(line)` 返回 `{ candidates: string[]; replaceFrom: number }` —— `replaceFrom` 是候选项要替换掉的起始下标，UI 据此拼接新的输入行。

- [ ] **Step 1: 写失败的测试**

`src/core/kernel.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createKernel, type Kernel } from './kernel'
import { buildInitialVfs } from './vfs/bootstrap'
import { chunkToText, type Chunk, type Host, type Process, type Writer } from './process'

const noopHost: Host = {
  clear() {}, setTheme() {}, listThemes() { return ['dracula'] }, currentTheme() { return 'dracula' },
}

const echoStub: Process = {
  name: 'echo', description: 'echo',
  async run(io) { io.stdout.writeText(io.argv.slice(1).join(' ')); return 0 },
}

const cdStub: Process = {
  name: 'cd', description: 'cd',
  async run(io, ctx) {
    const target = io.argv[1] ?? '/home/guest'
    ctx.cwd = ctx.vfs.resolve(ctx.cwd, target)
    return 0
  },
}

function collector() {
  const chunks: Chunk[] = []
  const writer: Writer = {
    write(c) { chunks.push(c) },
    writeText(s, style) { chunks.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
    writeLine(s, style) { writer.writeText(s + '\n', style) },
    close() {},
  }
  return { writer, out: () => chunks.map(chunkToText).join('') }
}

let kernel: Kernel

beforeEach(() => {
  kernel = createKernel({
    vfs: buildInitialVfs({
      '/home/guest/about.md': 'hi',
      '/home/guest/apple.md': '',
      '/home/guest/.hidden': '',
      '/home/guest/projects/p.md': '',
      '/etc/motd': 'welcome',
    }),
    host: noopHost,
    commands: [echoStub, cdStub],
  })
})

const run = async (line: string) => {
  const c = collector()
  const code = await kernel.run(line, c.writer, new AbortController().signal)
  return { code, out: c.out() }
}

describe('run', () => {
  it('执行命令并返回退出码', async () => {
    expect(await run('echo hi')).toMatchObject({ code: 0, out: 'hi' })
  })

  it('语法错误返回 2 并给出 bash 风格提示', async () => {
    const r = await run("echo 'unterminated")
    expect(r.code).toBe(2)
    expect(r.out).toContain('bash:')
  })

  it('非空命令进入历史', async () => {
    await run('echo a')
    await run('   ')
    await run('echo b')
    expect(kernel.ctx.history).toEqual(['echo a', 'echo b'])
  })

  it('$? 反映上一条命令的退出码', async () => {
    await run('nosuchcmd')
    expect((await run('echo $?')).out).toBe('127')
  })
})

describe('prompt', () => {
  it('家目录显示为 ~', () => {
    expect(kernel.prompt()).toBe('guest@terminal:~$ ')
  })

  it('随 cd 变化', async () => {
    await run('cd projects')
    expect(kernel.prompt()).toBe('guest@terminal:~/projects$ ')
  })

  it('家目录之外显示绝对路径', async () => {
    await run('cd /etc')
    expect(kernel.prompt()).toBe('guest@terminal:/etc$ ')
  })
})

describe('complete', () => {
  it('首个单词补全命令名', () => {
    const r = kernel.complete('ec')
    expect(r.candidates).toContain('echo')
    expect(r.replaceFrom).toBe(0)
  })

  it('后续单词补全路径', () => {
    const r = kernel.complete('echo ab')
    expect(r.candidates).toEqual(['about.md'])
    expect(r.replaceFrom).toBe(5)
  })

  it('多个候选全部返回', () => {
    expect(kernel.complete('echo a').candidates.sort()).toEqual(['about.md', 'apple.md'])
  })

  it('目录候选补尾斜杠', () => {
    expect(kernel.complete('echo pro').candidates).toEqual(['projects/'])
  })

  it('带目录前缀时保留前缀', () => {
    expect(kernel.complete('echo projects/').candidates).toEqual(['projects/p.md'])
  })

  it('默认不补全隐藏文件', () => {
    expect(kernel.complete('echo ').candidates).not.toContain('.hidden')
  })

  it('以点开头时可补全隐藏文件', () => {
    expect(kernel.complete('echo .h').candidates).toEqual(['.hidden'])
  })

  it('命令自带 complete 时优先使用', () => {
    kernel.ctx.registry.register({
      name: 'theme', description: 'theme',
      complete() { return ['dracula', 'nord'] },
      async run() { return 0 },
    })
    expect(kernel.complete('theme d').candidates).toEqual(['dracula', 'nord'])
  })

  it('空输入时列出全部命令', () => {
    expect(kernel.complete('').candidates.sort()).toEqual(['cd', 'echo'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/core/kernel.test.ts`
Expected: FAIL —— 找不到 `./kernel`。

- [ ] **Step 3: 实现 complete.ts**

`src/core/complete.ts`：

```ts
import type { Ctx } from './process'

/**
 * 补全一个路径片段。返回的候选是**完整片段**（含原有的目录前缀），
 * UI 可直接用它替换掉用户已输入的片段。目录候选带尾斜杠。
 */
export function completePath(
  frag: string,
  ctx: Ctx,
  opts: { dirsOnly?: boolean } = {},
): string[] {
  const slash = frag.lastIndexOf('/')
  const dirFrag = slash < 0 ? '' : frag.slice(0, slash + 1)   // 保留尾斜杠
  const base = slash < 0 ? frag : frag.slice(slash + 1)

  const home = ctx.env.get('HOME') ?? '/'
  const lookupTarget = dirFrag === ''
    ? '.'
    : dirFrag.startsWith('~/') ? home + dirFrag.slice(1) : dirFrag
  const absDir = ctx.vfs.resolve(ctx.cwd, lookupTarget)

  let entries
  try {
    entries = ctx.vfs.list(absDir)
  } catch {
    return []
  }

  return entries
    .filter(e => e.name.startsWith(base))
    .filter(e => base.startsWith('.') || !e.name.startsWith('.'))
    .filter(e => !opts.dirsOnly || e.kind === 'dir')
    .map(e => dirFrag + e.name + (e.kind === 'dir' ? '/' : ''))
}
```

- [ ] **Step 4: 实现 kernel.ts**

`src/core/kernel.ts`：

```ts
import { createRegistry } from './registry'
import { createEnv } from './shell/env'
import { lex, ShellSyntaxError } from './shell/lexer'
import { parse } from './shell/parser'
import { execute } from './shell/executor'
import { completePath } from './complete'
import type { Ctx, Host, Process, Writer } from './process'
import type { VFS } from './vfs/vfs'

const DEFAULT_ENV: Record<string, string> = {
  HOME: '/home/guest',
  USER: 'guest',
  HOSTNAME: 'terminal',
  SHELL: '/bin/bash',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  TERM: 'xterm-256color',
  LANG: 'zh_CN.UTF-8',
  PWD: '/home/guest',
}

export interface Kernel {
  readonly ctx: Ctx
  run(line: string, out: Writer, signal: AbortSignal): Promise<number>
  complete(line: string): { candidates: string[]; replaceFrom: number }
  prompt(): string
}

export function createKernel(opts: {
  vfs: VFS
  host: Host
  commands?: Process[]
  env?: Record<string, string>
}): Kernel {
  const env = createEnv({ ...DEFAULT_ENV, ...opts.env })
  const registry = createRegistry()
  for (const c of opts.commands ?? []) registry.register(c)

  // 会话状态：跨命令存活，由 getter/setter 暴露给每次 run 新建的 Ctx
  const session = {
    cwd: env.get('HOME') ?? '/',
    lastExitCode: 0,
    history: [] as string[],
  }

  function makeCtx(signal: AbortSignal): Ctx {
    return {
      get cwd() { return session.cwd },
      set cwd(v: string) { session.cwd = v; env.set('PWD', v) },
      get lastExitCode() { return session.lastExitCode },
      set lastExitCode(v: number) { session.lastExitCode = v },
      history: session.history,
      env, vfs: opts.vfs, registry, host: opts.host, signal,
    }
  }

  const idleCtx = makeCtx(new AbortController().signal)

  function shortCwd(): string {
    const home = env.get('HOME') ?? '/'
    if (session.cwd === home) return '~'
    if (session.cwd.startsWith(home + '/')) return '~' + session.cwd.slice(home.length)
    return session.cwd
  }

  return {
    get ctx() { return idleCtx },

    async run(line, out, signal) {
      if (line.trim() !== '') session.history.push(line)

      const ctx = makeCtx(signal)
      try {
        const code = await execute(parse(lex(line)), ctx, out)
        session.lastExitCode = code
        return code
      } catch (e) {
        // 只有词法/语法错误会走到这里；命令异常已在 executor 内部兜底
        const msg = e instanceof ShellSyntaxError ? e.message : String(e)
        out.writeLine(`bash: ${msg}`, { color: 'red' })
        session.lastExitCode = 2
        return 2
      }
    },

    complete(line) {
      const m = /(\S*)$/.exec(line)
      const frag = m?.[1] ?? ''
      const replaceFrom = line.length - frag.length
      const before = line.slice(0, replaceFrom).trim()

      if (before === '') {
        return {
          candidates: registry.list().map(p => p.name).filter(n => n.startsWith(frag)),
          replaceFrom,
        }
      }

      const argv = before.split(/\s+/)
      const proc = registry.get(argv[0]!)
      if (proc?.complete) {
        return { candidates: proc.complete([...argv, frag], idleCtx), replaceFrom }
      }
      return { candidates: completePath(frag, idleCtx), replaceFrom }
    },

    prompt() {
      return `${env.get('USER')}@${env.get('HOSTNAME')}:${shortCwd()}$ `
    },
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test src/core/kernel.test.ts`
Expected: PASS，全部通过。

- [ ] **Step 6: 全量回归与类型检查**

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`
Expected: 全绿。**此刻整个 shell 内核已完工，且没有一行 React 代码。** 这是本计划的中点，也是架构约束成立的证明。

- [ ] **Step 7: 提交**

```bash
git add src/core/complete.ts src/core/kernel.ts src/core/kernel.test.ts
git commit -m "feat: 内核门面与路径补全"
```

---
### Task 12: 命令基础设施与导航命令

**Files:**
- Create: `src/commands/lib.ts`
- Create: `src/commands/fs/ls.ts`, `src/commands/fs/pwd.ts`, `src/commands/fs/cd.ts`
- Create: `src/commands/index.ts`
- Test: `src/commands/lib.test.ts`
- Test: `src/commands/fs/nav.test.ts`
- Test: `src/commands/testkit.ts`（测试夹具，非测试文件）

**Interfaces:**
- Consumes: Task 1–11 全部
- Produces:
  - `parseFlags(argv: string[], known: string[]): { flags: Set<string>; operands: string[]; bad: string | null }`
  - `readAll(stdin: AsyncIterable<Chunk> | null): Promise<string>`
  - `readSources(io: IO, ctx: Ctx, files: string[]): Promise<{ parts: { name: string; text: string }[]; errors: VfsError[] }>`
  - `builtins: Process[]`（`src/commands/index.ts`，随任务推进逐步追加）
  - 测试夹具 `makeTestCtx()` / `runCmd(proc, argv, ctx, stdinText?)`

**已知限制（写进 `ls` 的注释）：** `ls` 始终一行一个条目，不做多列排版。这样 `ls | wc -l` 的结果才是正确的条目数。

- [ ] **Step 1: 写测试夹具**

`src/commands/testkit.ts`：

```ts
import { buildInitialVfs } from '../core/vfs/bootstrap'
import { createRegistry } from '../core/registry'
import { createEnv } from '../core/shell/env'
import { createPipe } from '../core/pipe'
import { chunkToText, type Chunk, type Ctx, type Host, type Process, type Writer } from '../core/process'

export const testHost: Host = {
  clear() {},
  setTheme() {},
  listThemes() { return ['dracula', 'nord'] },
  currentTheme() { return 'dracula' },
}

export const DEFAULT_FILES: Record<string, string> = {
  '/home/guest/about.md': 'line one\nline two\nline three\n',
  '/home/guest/apple.md': 'apple\n',
  '/home/guest/.hidden': 'secret\n',
  '/home/guest/projects/p.md': 'project p\n',
  '/etc/motd': 'welcome\n',
}

export function makeTestCtx(files: Record<string, string> = DEFAULT_FILES): Ctx {
  const env = createEnv({ HOME: '/home/guest', USER: 'guest', HOSTNAME: 'terminal', PWD: '/home/guest' })
  const session = { cwd: '/home/guest', lastExitCode: 0 }
  return {
    get cwd() { return session.cwd },
    set cwd(v: string) { session.cwd = v; env.set('PWD', v) },
    get lastExitCode() { return session.lastExitCode },
    set lastExitCode(v: number) { session.lastExitCode = v },
    history: [],
    env,
    vfs: buildInitialVfs(files, () => 1_700_000_000_000),
    registry: createRegistry(),
    host: testHost,
    signal: new AbortController().signal,
  }
}

/** 跑一个命令，返回 stdout / stderr 的文本与退出码。 */
export async function runCmd(
  proc: Process,
  argv: string[],
  ctx: Ctx,
  stdinText?: string,
): Promise<{ code: number; out: string; err: string; chunks: Chunk[] }> {
  const outChunks: Chunk[] = []
  const errChunks: Chunk[] = []
  const mk = (sink: Chunk[]): Writer => {
    const w: Writer = {
      write(c) { sink.push(c) },
      writeText(s, style) { sink.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
      writeLine(s, style) { w.writeText(s + '\n', style) },
      close() {},
    }
    return w
  }

  let stdin: AsyncIterable<Chunk> | null = null
  if (stdinText !== undefined) {
    const pipe = createPipe()
    pipe.writer.writeText(stdinText)
    pipe.writer.close()
    stdin = pipe.reader
  }

  const code = await proc.run({ argv, stdin, stdout: mk(outChunks), stderr: mk(errChunks) }, ctx)
  return {
    code,
    out: outChunks.map(chunkToText).join(''),
    err: errChunks.map(chunkToText).join(''),
    chunks: outChunks,
  }
}
```

- [ ] **Step 2: 写 lib 的失败测试**

`src/commands/lib.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parseFlags, readAll, readSources } from './lib'
import { createPipe } from '../core/pipe'
import { makeTestCtx } from './testkit'
import type { IO } from '../core/process'

describe('parseFlags', () => {
  it('拆开合并的短选项', () => {
    const r = parseFlags(['ls', '-la'], ['l', 'a'])
    expect([...r.flags].sort()).toEqual(['a', 'l'])
    expect(r.bad).toBeNull()
  })

  it('分离操作数', () => {
    expect(parseFlags(['ls', '-l', 'dir'], ['l']).operands).toEqual(['dir'])
  })

  it('未知选项报告到 bad', () => {
    expect(parseFlags(['ls', '-z'], ['l']).bad).toBe('z')
  })

  it('-- 之后全部当作操作数', () => {
    expect(parseFlags(['rm', '--', '-weird'], ['f']).operands).toEqual(['-weird'])
  })

  it('单独的 - 是操作数不是选项', () => {
    expect(parseFlags(['cat', '-'], []).operands).toEqual(['-'])
  })
})

describe('readAll', () => {
  it('stdin 为 null 时返回空串', async () => {
    expect(await readAll(null)).toBe('')
  })

  it('拼接全部 chunk', async () => {
    const p = createPipe()
    p.writer.writeText('a')
    p.writer.writeText('b')
    p.writer.close()
    expect(await readAll(p.reader)).toBe('ab')
  })
})

describe('readSources', () => {
  const io = (stdin: IO['stdin']): IO =>
    ({ argv: [], stdin, stdout: null as never, stderr: null as never })

  it('无文件参数时读 stdin', async () => {
    const p = createPipe()
    p.writer.writeText('from stdin')
    p.writer.close()
    const r = await readSources(io(p.reader), makeTestCtx(), [])
    expect(r.parts).toEqual([{ name: '-', text: 'from stdin' }])
  })

  it('按顺序读取多个文件', async () => {
    const r = await readSources(io(null), makeTestCtx(), ['apple.md', 'about.md'])
    expect(r.parts.map(p => p.name)).toEqual(['apple.md', 'about.md'])
    expect(r.parts[0]!.text).toBe('apple\n')
  })

  it('读不到的文件记入 errors，其余照常返回', async () => {
    const r = await readSources(io(null), makeTestCtx(), ['nope.md', 'apple.md'])
    expect(r.errors).toHaveLength(1)
    expect(r.parts.map(p => p.name)).toEqual(['apple.md'])
  })
})
```

- [ ] **Step 3: 实现 lib.ts**

`src/commands/lib.ts`：

```ts
import { chunkToText, type Chunk, type Ctx, type IO } from '../core/process'
import { VfsError } from '../core/vfs/vfs'

/**
 * 解析短选项。支持合并（-la）、`--` 终止符。
 * 不支持长选项 —— 本项目的命令都不需要。
 */
export function parseFlags(
  argv: string[],
  known: string[],
): { flags: Set<string>; operands: string[]; bad: string | null } {
  const flags = new Set<string>()
  const operands: string[] = []
  let bad: string | null = null
  let noMoreFlags = false

  for (const arg of argv.slice(1)) {
    if (noMoreFlags) { operands.push(arg); continue }
    if (arg === '--') { noMoreFlags = true; continue }
    if (arg.length > 1 && arg.startsWith('-')) {
      for (const ch of arg.slice(1)) {
        if (known.includes(ch)) flags.add(ch)
        else bad ??= ch
      }
      continue
    }
    operands.push(arg)      // 单独的 '-' 落到这里，表示标准输入
  }

  return { flags, operands, bad }
}

/** 把 stdin 全部读成一个字符串。富节点按 toText() 降级。 */
export async function readAll(stdin: AsyncIterable<Chunk> | null): Promise<string> {
  if (!stdin) return ''
  let s = ''
  for await (const c of stdin) s += chunkToText(c)
  return s
}

/**
 * 按 Unix 惯例取输入：给了文件就读文件，没给就读 stdin。
 * 读不到的文件收进 errors 由调用方决定如何报错，不中断其余文件。
 */
export async function readSources(
  io: IO,
  ctx: Ctx,
  files: string[],
): Promise<{ parts: { name: string; text: string }[]; errors: VfsError[] }> {
  if (files.length === 0) {
    return { parts: [{ name: '-', text: await readAll(io.stdin) }], errors: [] }
  }

  const parts: { name: string; text: string }[] = []
  const errors: VfsError[] = []
  for (const f of files) {
    if (f === '-') {
      parts.push({ name: '-', text: await readAll(io.stdin) })
      continue
    }
    try {
      parts.push({ name: f, text: ctx.vfs.readFile(ctx.vfs.resolve(ctx.cwd, f)) })
    } catch (e) {
      if (e instanceof VfsError) errors.push(e)
      else throw e
    }
  }
  return { parts, errors }
}
```

- [ ] **Step 4: 运行 lib 测试确认通过**

Run: `pnpm test src/commands/lib.test.ts`
Expected: PASS。

- [ ] **Step 5: 写导航命令的失败测试**

`src/commands/fs/nav.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ls } from './ls'
import { pwd } from './pwd'
import { cd } from './cd'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('pwd', () => {
  it('打印当前目录', async () => {
    expect((await runCmd(pwd, ['pwd'], ctx)).out).toBe('/home/guest\n')
  })
})

describe('cd', () => {
  it('无参数回到家目录', async () => {
    ctx.cwd = '/etc'
    await runCmd(cd, ['cd'], ctx)
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('进入相对目录', async () => {
    await runCmd(cd, ['cd', 'projects'], ctx)
    expect(ctx.cwd).toBe('/home/guest/projects')
  })

  it('.. 回到上级', async () => {
    ctx.cwd = '/home/guest/projects'
    await runCmd(cd, ['cd', '..'], ctx)
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('目标不存在时报错且不改变 cwd', async () => {
    const r = await runCmd(cd, ['cd', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('No such file or directory')
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('目标是文件时报 Not a directory', async () => {
    const r = await runCmd(cd, ['cd', 'about.md'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Not a directory')
  })

  it('cd - 回到上一个目录', async () => {
    await runCmd(cd, ['cd', 'projects'], ctx)
    await runCmd(cd, ['cd', '-'], ctx)
    expect(ctx.cwd).toBe('/home/guest')
  })

  it('同步更新 PWD 环境变量', async () => {
    await runCmd(cd, ['cd', 'projects'], ctx)
    expect(ctx.env.get('PWD')).toBe('/home/guest/projects')
  })

  it('补全只提供目录', () => {
    expect(cd.complete!(['cd', ''], ctx)).toEqual(['projects/'])
  })
})

describe('ls', () => {
  it('一行一个条目，默认隐藏点文件', async () => {
    const r = await runCmd(ls, ['ls'], ctx)
    expect(r.out).toBe('about.md\napple.md\nprojects\n')
  })

  it('-a 显示隐藏文件', async () => {
    expect((await runCmd(ls, ['ls', '-a'], ctx)).out).toContain('.hidden')
  })

  it('接受目录参数', async () => {
    expect((await runCmd(ls, ['ls', 'projects'], ctx)).out).toBe('p.md\n')
  })

  it('目标是文件时打印该文件名', async () => {
    expect((await runCmd(ls, ['ls', 'apple.md'], ctx)).out).toBe('apple.md\n')
  })

  it('-l 输出权限、大小与名称', async () => {
    const r = await runCmd(ls, ['ls', '-l', 'apple.md'], ctx)
    expect(r.out).toMatch(/^-rw-r--r--\s+guest\s+6\s+.*apple\.md\n$/)
  })

  it('-l 下目录以 d 开头', async () => {
    expect((await runCmd(ls, ['ls', '-l', 'projects'], ctx)).out).toMatch(/^-rw|^d/)
  })

  it('目录名用蓝色加粗标记', async () => {
    const r = await runCmd(ls, ['ls'], ctx)
    expect(r.chunks.some(c => c.type === 'text' && c.text.startsWith('projects') && c.style?.bold)).toBe(true)
  })

  it('不存在的路径报错并返回 2', async () => {
    const r = await runCmd(ls, ['ls', 'nope'], ctx)
    expect(r.code).toBe(2)
    expect(r.err).toContain('No such file or directory')
  })

  it('未知选项返回 2', async () => {
    expect((await runCmd(ls, ['ls', '-z'], ctx)).code).toBe(2)
  })
})
```

- [ ] **Step 6: 运行测试确认失败**

Run: `pnpm test src/commands/fs/`
Expected: FAIL —— 找不到 `./ls` 等模块。

- [ ] **Step 7: 实现三个命令**

`src/commands/fs/pwd.ts`：

```ts
import type { Process } from '../../core/process'

export const pwd: Process = {
  name: 'pwd',
  description: '打印当前工作目录',
  usage: 'pwd',
  async run(io, ctx) {
    io.stdout.writeLine(ctx.cwd)
    return 0
  },
}
```

`src/commands/fs/cd.ts`：

```ts
import { completePath } from '../../core/complete'
import type { Process } from '../../core/process'

export const cd: Process = {
  name: 'cd',
  description: '切换目录',
  usage: 'cd [目录]    cd -  返回上一个目录',

  complete(argv, ctx) {
    return completePath(argv[argv.length - 1] ?? '', ctx, { dirsOnly: true })
  },

  async run(io, ctx) {
    const home = ctx.env.get('HOME') ?? '/'
    const arg = io.argv[1]

    let target: string
    if (arg === undefined) target = home
    else if (arg === '-') {
      const prev = ctx.env.get('OLDPWD')
      if (!prev) { io.stderr.writeLine('cd: OLDPWD not set'); return 1 }
      target = prev
      io.stdout.writeLine(prev)      // 与 bash 一致：cd - 会回显目标
    } else target = arg

    const abs = ctx.vfs.resolve(ctx.cwd, target)
    const st = ctx.vfs.stat(abs)
    if (!st) { io.stderr.writeLine(`cd: ${target}: No such file or directory`); return 1 }
    if (st.kind !== 'dir') { io.stderr.writeLine(`cd: ${target}: Not a directory`); return 1 }

    ctx.env.set('OLDPWD', ctx.cwd)
    ctx.cwd = abs                     // setter 会同步 PWD
    return 0
  },
}
```

`src/commands/fs/ls.ts`：

```ts
import { parseFlags } from '../lib'
import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import type { Inode } from '../../core/vfs/vfs'
import type { Process, Style } from '../../core/process'

const DIR_STYLE: Style = { color: 'blue', bold: true }

/** 刻意一行一个条目，不做多列排版 —— 这样 `ls | wc -l` 才是正确的条目数。 */
export const ls: Process = {
  name: 'ls',
  description: '列出目录内容',
  usage: 'ls [-la] [路径...]',

  complete(argv, ctx) {
    return completePath(argv[argv.length - 1] ?? '', ctx)
  },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['l', 'a'])
    if (bad) { io.stderr.writeLine(`ls: invalid option -- '${bad}'`); return 2 }

    const targets = operands.length > 0 ? operands : ['.']
    const showHidden = flags.has('a')
    const longFormat = flags.has('l')
    let code = 0

    const emit = (inode: Inode, label: string) => {
      const style = inode.kind === 'dir' ? DIR_STYLE : undefined
      if (!longFormat) { io.stdout.writeLine(label, style); return }
      const mode = inode.kind === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'
      const size = inode.kind === 'file' ? inode.content.length : 4096
      const when = new Date(inode.mtime).toISOString().slice(0, 16).replace('T', ' ')
      io.stdout.writeText(`${mode}  guest  ${String(size).padStart(6)}  ${when}  `)
      io.stdout.writeLine(label, style)
    }

    for (const t of targets) {
      const abs = ctx.vfs.resolve(ctx.cwd, t)
      const st = ctx.vfs.stat(abs)
      if (!st) {
        io.stderr.writeLine(`ls: cannot access '${t}': No such file or directory`)
        code = 2
        continue
      }
      if (st.kind === 'file') { emit(st, t); continue }

      // 多目标时按 bash 惯例加上标题
      if (targets.length > 1) io.stdout.writeLine(`${t}:`)
      try {
        for (const entry of ctx.vfs.list(abs)) {
          if (!showHidden && entry.name.startsWith('.')) continue
          emit(entry, entry.name)
        }
      } catch (e) {
        io.stderr.writeLine(formatError('ls', e))
        code = 2
      }
      if (targets.length > 1) io.stdout.writeText('\n')
    }
    return code
  },
}
```

- [ ] **Step 8: 建立命令汇总入口**

`src/commands/index.ts`：

```ts
import { ls } from './fs/ls'
import { pwd } from './fs/pwd'
import { cd } from './fs/cd'
import type { Process } from '../core/process'

/** 全部内置命令。后续任务往这里追加。 */
export const builtins: Process[] = [ls, pwd, cd]
```

- [ ] **Step 9: 运行测试确认通过**

Run: `pnpm test src/commands/`
Expected: PASS。若 `ls -l apple.md` 的正则不匹配，先打印实际输出核对空格数再调整测试或实现。

- [ ] **Step 10: 提交**

```bash
git add src/commands
git commit -m "feat: 命令基础设施与 ls/pwd/cd"
```

---

### Task 13: 读取与文本命令

一次做完管道链路上的全部命令，因为它们共用 `readSources` 且相互配合才能验证端到端的管道行为。

**Files:**
- Create: `src/commands/fs/cat.ts`, `src/commands/fs/head.ts`, `src/commands/fs/tail.ts`, `src/commands/fs/wc.ts`
- Create: `src/commands/text/echo.ts`, `src/commands/text/grep.ts`, `src/commands/text/sort.ts`, `src/commands/text/uniq.ts`
- Modify: `src/commands/index.ts`
- Test: `src/commands/text.test.ts`
- Test: `src/commands/pipeline.integration.test.ts`

**Interfaces:**
- Consumes: `parseFlags`, `readAll`, `readSources`（Task 12）、`createKernel`（Task 11）
- Produces: `cat`, `head`, `tail`, `wc`, `echo`, `grep`, `sort`, `uniq`（均为 `Process`）

- [ ] **Step 1: 写失败的测试**

`src/commands/text.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { cat } from './fs/cat'
import { head } from './fs/head'
import { tail } from './fs/tail'
import { wc } from './fs/wc'
import { echo } from './text/echo'
import { grep } from './text/grep'
import { sort } from './text/sort'
import { uniq } from './text/uniq'
import { makeTestCtx, runCmd } from './testkit'
import type { Ctx } from '../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('cat', () => {
  it('打印文件内容', async () => {
    expect((await runCmd(cat, ['cat', 'apple.md'], ctx)).out).toBe('apple\n')
  })

  it('按顺序拼接多个文件', async () => {
    const r = await runCmd(cat, ['cat', 'apple.md', 'apple.md'], ctx)
    expect(r.out).toBe('apple\napple\n')
  })

  it('无参数时读 stdin', async () => {
    expect((await runCmd(cat, ['cat'], ctx, 'piped')).out).toBe('piped')
  })

  it('文件不存在时报错并返回 1', async () => {
    const r = await runCmd(cat, ['cat', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('No such file or directory')
  })

  it('读目录时报 Is a directory', async () => {
    expect((await runCmd(cat, ['cat', 'projects'], ctx)).err).toContain('Is a directory')
  })
})

describe('head / tail', () => {
  it('head 默认取前 10 行', async () => {
    expect((await runCmd(head, ['head', 'about.md'], ctx)).out).toBe('line one\nline two\nline three\n')
  })

  it('head -n 限制行数', async () => {
    expect((await runCmd(head, ['head', '-n', '2', 'about.md'], ctx)).out).toBe('line one\nline two\n')
  })

  it('tail -n 取末尾行', async () => {
    expect((await runCmd(tail, ['tail', '-n', '1', 'about.md'], ctx)).out).toBe('line three\n')
  })

  it('-n 参数非法时返回 2', async () => {
    expect((await runCmd(head, ['head', '-n', 'x', 'about.md'], ctx)).code).toBe(2)
  })
})

describe('wc', () => {
  it('默认输出行数、词数、字节数', async () => {
    expect((await runCmd(wc, ['wc', 'apple.md'], ctx)).out.trim()).toBe('1 1 6 apple.md')
  })

  it('-l 只输出行数', async () => {
    expect((await runCmd(wc, ['wc', '-l', 'about.md'], ctx)).out.trim()).toBe('3 about.md')
  })

  it('读 stdin 时不带文件名', async () => {
    expect((await runCmd(wc, ['wc', '-l'], ctx, 'a\nb\n')).out.trim()).toBe('2')
  })
})

describe('echo', () => {
  it('打印参数并换行', async () => {
    expect((await runCmd(echo, ['echo', 'a', 'b'], ctx)).out).toBe('a b\n')
  })

  it('-n 抑制末尾换行', async () => {
    expect((await runCmd(echo, ['echo', '-n', 'a'], ctx)).out).toBe('a')
  })

  it('无参数时只输出换行', async () => {
    expect((await runCmd(echo, ['echo'], ctx)).out).toBe('\n')
  })
})

describe('grep', () => {
  it('输出匹配行', async () => {
    expect((await runCmd(grep, ['grep', 'two', 'about.md'], ctx)).out).toBe('line two\n')
  })

  it('无匹配时返回 1', async () => {
    expect((await runCmd(grep, ['grep', 'zzz', 'about.md'], ctx)).code).toBe(1)
  })

  it('-i 忽略大小写', async () => {
    expect((await runCmd(grep, ['grep', '-i', 'TWO', 'about.md'], ctx)).out).toBe('line two\n')
  })

  it('-v 反向匹配', async () => {
    expect((await runCmd(grep, ['grep', '-v', 'two', 'about.md'], ctx)).out).toBe('line one\nline three\n')
  })

  it('-n 前缀行号', async () => {
    expect((await runCmd(grep, ['grep', '-n', 'two', 'about.md'], ctx)).out).toBe('2:line two\n')
  })

  it('从 stdin 读取', async () => {
    expect((await runCmd(grep, ['grep', 'b'], ctx, 'a\nb\n')).out).toBe('b\n')
  })

  it('缺少模式时返回 2', async () => {
    expect((await runCmd(grep, ['grep'], ctx)).code).toBe(2)
  })

  it('非法正则不崩溃，报错返回 2', async () => {
    const r = await runCmd(grep, ['grep', '[', 'about.md'], ctx)
    expect(r.code).toBe(2)
    expect(r.err).toContain('invalid')
  })
})

describe('sort / uniq', () => {
  it('sort 按字典序', async () => {
    expect((await runCmd(sort, ['sort'], ctx, 'b\na\nc\n')).out).toBe('a\nb\nc\n')
  })

  it('sort -r 逆序', async () => {
    expect((await runCmd(sort, ['sort', '-r'], ctx, 'a\nb\n')).out).toBe('b\na\n')
  })

  it('uniq 折叠相邻重复行', async () => {
    expect((await runCmd(uniq, ['uniq'], ctx, 'a\na\nb\na\n')).out).toBe('a\nb\na\n')
  })

  it('uniq -c 前缀计数', async () => {
    expect((await runCmd(uniq, ['uniq', '-c'], ctx, 'a\na\nb\n')).out).toBe('      2 a\n      1 b\n')
  })
})
```

`src/commands/pipeline.integration.test.ts` —— 通过真实内核验证整条链路：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createKernel, type Kernel } from '../core/kernel'
import { buildInitialVfs } from '../core/vfs/bootstrap'
import { builtins } from './index'
import { testHost, DEFAULT_FILES } from './testkit'
import { chunkToText, type Chunk, type Writer } from '../core/process'

let kernel: Kernel
beforeEach(() => {
  kernel = createKernel({
    vfs: buildInitialVfs(DEFAULT_FILES),
    host: testHost,
    commands: builtins,
  })
})

async function sh(line: string) {
  const chunks: Chunk[] = []
  const w: Writer = {
    write(c) { chunks.push(c) },
    writeText(s, style) { chunks.push({ type: 'text', text: s, ...(style ? { style } : {}) }) },
    writeLine(s, style) { w.writeText(s + '\n', style) },
    close() {},
  }
  const code = await kernel.run(line, w, new AbortController().signal)
  return { code, out: chunks.map(chunkToText).join('') }
}

describe('端到端管道', () => {
  it('cat | grep', async () => {
    expect((await sh('cat about.md | grep two')).out).toBe('line two\n')
  })

  it('三段管道', async () => {
    expect((await sh('cat about.md | grep line | wc -l')).out.trim()).toBe('3')
  })

  it('重定向后再读回来', async () => {
    await sh('echo hello > greet.txt')
    expect((await sh('cat greet.txt')).out).toBe('hello\n')
  })

  it('追加重定向', async () => {
    await sh('echo a > f.txt')
    await sh('echo b >> f.txt')
    expect((await sh('cat f.txt')).out).toBe('a\nb\n')
  })

  it('glob 展开后传给命令', async () => {
    expect((await sh('cat *.md | wc -l')).out.trim()).toBe('4')
  })

  it('&& 串联', async () => {
    expect((await sh('cd projects && pwd')).out).toBe('/home/guest/projects\n')
  })

  it('变量展开', async () => {
    expect((await sh('echo $HOME')).out).toBe('/home/guest\n')
  })

  it('管道中命令失败不影响整体不崩溃', async () => {
    const r = await sh('cat nope | wc -l')
    expect(r.out).toContain('No such file or directory')
    expect(r.out).toContain('0')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/commands/`
Expected: FAIL —— 找不到 `./fs/cat` 等模块。

- [ ] **Step 3: 实现读取类命令**

`src/commands/fs/cat.ts`：

```ts
import { readSources } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const cat: Process = {
  name: 'cat',
  description: '打印文件内容',
  usage: 'cat [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const files = io.argv.slice(1)
    const { parts, errors } = await readSources(io, ctx, files)
    for (const p of parts) io.stdout.writeText(p.text)
    for (const e of errors) io.stderr.writeLine(`cat: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
```

`src/commands/fs/head.ts`：

```ts
import { readSources } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

/** 解析 `-n N`，返回 null 表示参数非法。 */
export function takeCount(argv: string[], fallback: number): { count: number | null; rest: string[] } {
  const rest: string[] = []
  let count = fallback
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '-n') {
      const raw = argv[i + 1]
      const n = Number(raw)
      if (raw === undefined || !Number.isInteger(n) || n < 0) return { count: null, rest }
      count = n
      i++
      continue
    }
    rest.push(argv[i]!)
  }
  return { count, rest }
}

export const head: Process = {
  name: 'head',
  description: '输出文件开头若干行',
  usage: 'head [-n 行数] [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { count, rest } = takeCount(io.argv, 10)
    if (count === null) { io.stderr.writeLine('head: invalid number of lines'); return 2 }
    const { parts, errors } = await readSources(io, ctx, rest)
    for (const p of parts) {
      const lines = p.text.split('\n')
      const hasTrailing = lines[lines.length - 1] === ''
      if (hasTrailing) lines.pop()
      io.stdout.writeText(lines.slice(0, count).map(l => l + '\n').join(''))
    }
    for (const e of errors) io.stderr.writeLine(`head: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
```

`src/commands/fs/tail.ts`：

```ts
import { readSources } from '../lib'
import { takeCount } from './head'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const tail: Process = {
  name: 'tail',
  description: '输出文件末尾若干行',
  usage: 'tail [-n 行数] [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { count, rest } = takeCount(io.argv, 10)
    if (count === null) { io.stderr.writeLine('tail: invalid number of lines'); return 2 }
    const { parts, errors } = await readSources(io, ctx, rest)
    for (const p of parts) {
      const lines = p.text.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      io.stdout.writeText(lines.slice(-count).map(l => l + '\n').join(''))
    }
    for (const e of errors) io.stderr.writeLine(`tail: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
```

`src/commands/fs/wc.ts`：

```ts
import { parseFlags, readSources } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const wc: Process = {
  name: 'wc',
  description: '统计行数、词数与字节数',
  usage: 'wc [-lwc] [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['l', 'w', 'c'])
    if (bad) { io.stderr.writeLine(`wc: invalid option -- '${bad}'`); return 2 }

    const showAll = flags.size === 0
    const { parts, errors } = await readSources(io, ctx, operands)

    for (const p of parts) {
      const lines = p.text === '' ? 0 : p.text.split('\n').length - (p.text.endsWith('\n') ? 1 : 0)
      const words = p.text.trim() === '' ? 0 : p.text.trim().split(/\s+/).length
      const bytes = p.text.length

      const cols: number[] = []
      if (showAll || flags.has('l')) cols.push(lines)
      if (showAll || flags.has('w')) cols.push(words)
      if (showAll || flags.has('c')) cols.push(bytes)

      const label = p.name === '-' ? '' : ` ${p.name}`
      io.stdout.writeLine(cols.join(' ') + label)
    }
    for (const e of errors) io.stderr.writeLine(`wc: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
```

- [ ] **Step 4: 实现文本类命令**

`src/commands/text/echo.ts`：

```ts
import type { Process } from '../../core/process'

export const echo: Process = {
  name: 'echo',
  description: '输出参数',
  usage: 'echo [-n] [文本...]',

  async run(io) {
    const noNewline = io.argv[1] === '-n'
    const words = io.argv.slice(noNewline ? 2 : 1)
    io.stdout.writeText(words.join(' ') + (noNewline ? '' : '\n'))
    return 0
  },
}
```

`src/commands/text/grep.ts`：

```ts
import { parseFlags, readSources } from '../lib'
import { completePath } from '../../core/complete'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const grep: Process = {
  name: 'grep',
  description: '按正则筛选行',
  usage: 'grep [-inv] 模式 [文件...]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['i', 'n', 'v'])
    if (bad) { io.stderr.writeLine(`grep: invalid option -- '${bad}'`); return 2 }

    const pattern = operands[0]
    if (pattern === undefined) { io.stderr.writeLine('用法: grep [-inv] 模式 [文件...]'); return 2 }

    let re: RegExp
    try {
      re = new RegExp(pattern, flags.has('i') ? 'i' : '')
    } catch {
      io.stderr.writeLine(`grep: invalid regular expression: ${pattern}`)
      return 2
    }

    const invert = flags.has('v')
    const withNumber = flags.has('n')
    const { parts, errors } = await readSources(io, ctx, operands.slice(1))

    let matched = false
    const multi = parts.filter(p => p.name !== '-').length > 1

    for (const p of parts) {
      const lines = p.text.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      lines.forEach((lineText, idx) => {
        if (re.test(lineText) === invert) return
        matched = true
        const prefix =
          (multi ? `${p.name}:` : '') + (withNumber ? `${idx + 1}:` : '')
        io.stdout.writeLine(prefix + lineText)
      })
    }

    for (const e of errors) io.stderr.writeLine(`grep: ${e.path}: ${vfsMessage(e.code)}`)
    if (errors.length > 0) return 2
    return matched ? 0 : 1        // 与 grep 一致：无匹配是退出码 1
  },
}
```

`src/commands/text/sort.ts`：

```ts
import { parseFlags, readSources } from '../lib'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const sort: Process = {
  name: 'sort',
  description: '按行排序',
  usage: 'sort [-r] [文件...]',

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['r'])
    if (bad) { io.stderr.writeLine(`sort: invalid option -- '${bad}'`); return 2 }

    const { parts, errors } = await readSources(io, ctx, operands)
    const lines = parts.flatMap(p => {
      const ls = p.text.split('\n')
      if (ls[ls.length - 1] === '') ls.pop()
      return ls
    })

    lines.sort((a, b) => a.localeCompare(b))
    if (flags.has('r')) lines.reverse()
    io.stdout.writeText(lines.map(l => l + '\n').join(''))

    for (const e of errors) io.stderr.writeLine(`sort: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
```

`src/commands/text/uniq.ts`：

```ts
import { parseFlags, readSources } from '../lib'
import { vfsMessage } from '../../core/errors'
import type { Process } from '../../core/process'

export const uniq: Process = {
  name: 'uniq',
  description: '折叠相邻的重复行',
  usage: 'uniq [-c] [文件...]',

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['c'])
    if (bad) { io.stderr.writeLine(`uniq: invalid option -- '${bad}'`); return 2 }

    const { parts, errors } = await readSources(io, ctx, operands)
    const lines = parts.flatMap(p => {
      const ls = p.text.split('\n')
      if (ls[ls.length - 1] === '') ls.pop()
      return ls
    })

    let prev: string | null = null
    let count = 0
    const flush = () => {
      if (prev === null) return
      io.stdout.writeLine(flags.has('c') ? `${String(count).padStart(7)} ${prev}` : prev)
    }
    for (const l of lines) {
      if (l === prev) { count++; continue }
      flush()
      prev = l
      count = 1
    }
    flush()

    for (const e of errors) io.stderr.writeLine(`uniq: ${e.path}: ${vfsMessage(e.code)}`)
    return errors.length > 0 ? 1 : 0
  },
}
```

- [ ] **Step 5: 登记到 builtins**

`src/commands/index.ts` 改为：

```ts
import { ls } from './fs/ls'
import { pwd } from './fs/pwd'
import { cd } from './fs/cd'
import { cat } from './fs/cat'
import { head } from './fs/head'
import { tail } from './fs/tail'
import { wc } from './fs/wc'
import { echo } from './text/echo'
import { grep } from './text/grep'
import { sort } from './text/sort'
import { uniq } from './text/uniq'
import type { Process } from '../core/process'

export const builtins: Process[] = [
  ls, pwd, cd, cat, head, tail, wc,
  echo, grep, sort, uniq,
]
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm test src/commands/`
Expected: PASS。集成测试是这一步的重点 —— 它第一次证明 lexer、parser、expand、executor、pipe、VFS 六个模块协同正确。

- [ ] **Step 7: 提交**

```bash
git add src/commands
git commit -m "feat: 读取与文本处理命令"
```

---
### Task 14: 文件树与写命令

**Files:**
- Create: `src/commands/fs/tree.ts`, `src/commands/fs/find.ts`, `src/commands/fs/touch.ts`, `src/commands/fs/mkdir.ts`, `src/commands/fs/rm.ts`
- Modify: `src/commands/index.ts`
- Test: `src/commands/fs/write.test.ts`

**Interfaces:**
- Consumes: `parseFlags`（Task 12）、`VFS`（Task 5）、`completePath`（Task 11）
- Produces: `tree`, `find`, `touch`, `mkdir`, `rm`

- [ ] **Step 1: 写失败的测试**

`src/commands/fs/write.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { tree } from './tree'
import { find } from './find'
import { touch } from './touch'
import { mkdir } from './mkdir'
import { rm } from './rm'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('tree', () => {
  it('用制表符画出目录树', async () => {
    const r = await runCmd(tree, ['tree'], ctx)
    expect(r.out).toBe(
      '.\n' +
      '├── about.md\n' +
      '├── apple.md\n' +
      '└── projects\n' +
      '    └── p.md\n' +
      '\n1 directory, 3 files\n',
    )
  })

  it('接受目录参数', async () => {
    expect((await runCmd(tree, ['tree', 'projects'], ctx)).out).toContain('└── p.md')
  })

  it('默认不显示隐藏文件', async () => {
    expect((await runCmd(tree, ['tree'], ctx)).out).not.toContain('.hidden')
  })
})

describe('find', () => {
  it('无条件时递归列出全部路径', async () => {
    const r = await runCmd(find, ['find'], ctx)
    expect(r.out).toContain('./about.md')
    expect(r.out).toContain('./projects/p.md')
  })

  it('-name 按 glob 过滤', async () => {
    const r = await runCmd(find, ['find', '.', '-name', '*.md'], ctx)
    expect(r.out).toContain('./about.md')
    expect(r.out).not.toContain('./projects\n')
  })

  it('起点不存在时返回 1', async () => {
    expect((await runCmd(find, ['find', 'nope'], ctx)).code).toBe(1)
  })
})

describe('touch', () => {
  it('创建空文件', async () => {
    await runCmd(touch, ['touch', 'new.txt'], ctx)
    expect(ctx.vfs.readFile('/home/guest/new.txt')).toBe('')
  })

  it('已存在的文件内容不变', async () => {
    await runCmd(touch, ['touch', 'apple.md'], ctx)
    expect(ctx.vfs.readFile('/home/guest/apple.md')).toBe('apple\n')
  })

  it('无参数返回 2', async () => {
    expect((await runCmd(touch, ['touch'], ctx)).code).toBe(2)
  })
})

describe('mkdir', () => {
  it('创建目录', async () => {
    await runCmd(mkdir, ['mkdir', 'newdir'], ctx)
    expect(ctx.vfs.isDir('/home/guest/newdir')).toBe(true)
  })

  it('-p 创建多级目录', async () => {
    await runCmd(mkdir, ['mkdir', '-p', 'a/b/c'], ctx)
    expect(ctx.vfs.isDir('/home/guest/a/b/c')).toBe(true)
  })

  it('已存在时报错', async () => {
    const r = await runCmd(mkdir, ['mkdir', 'projects'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('File exists')
  })

  it('-p 时已存在不报错', async () => {
    expect((await runCmd(mkdir, ['mkdir', '-p', 'projects'], ctx)).code).toBe(0)
  })
})

describe('rm', () => {
  it('删除文件', async () => {
    await runCmd(rm, ['rm', 'apple.md'], ctx)
    expect(ctx.vfs.stat('/home/guest/apple.md')).toBeNull()
  })

  it('删除非空目录需要 -r', async () => {
    const r = await runCmd(rm, ['rm', 'projects'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Is a directory')
  })

  it('-r 删除整棵子树', async () => {
    await runCmd(rm, ['rm', '-r', 'projects'], ctx)
    expect(ctx.vfs.stat('/home/guest/projects')).toBeNull()
  })

  it('文件不存在时报错', async () => {
    expect((await runCmd(rm, ['rm', 'nope'], ctx)).code).toBe(1)
  })

  it('-f 让不存在的文件静默通过', async () => {
    const r = await runCmd(rm, ['rm', '-f', 'nope'], ctx)
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
  })

  it('拒绝删除根目录', async () => {
    const r = await runCmd(rm, ['rm', '-rf', '/'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Operation not permitted')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/commands/fs/write.test.ts`
Expected: FAIL —— 找不到 `./tree` 等模块。

- [ ] **Step 3: 实现**

`src/commands/fs/tree.ts`：

```ts
import { completePath } from '../../core/complete'
import type { DirInode } from '../../core/vfs/vfs'
import type { Process, Style, Writer } from '../../core/process'

const DIR_STYLE: Style = { color: 'blue', bold: true }

export const tree: Process = {
  name: 'tree',
  description: '以树状结构显示目录',
  usage: 'tree [目录]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx, { dirsOnly: true }) },

  async run(io, ctx) {
    const target = io.argv[1] ?? '.'
    const abs = ctx.vfs.resolve(ctx.cwd, target)
    const st = ctx.vfs.stat(abs)
    if (!st) { io.stderr.writeLine(`tree: ${target}: No such file or directory`); return 1 }
    if (st.kind !== 'dir') { io.stderr.writeLine(`tree: ${target}: Not a directory`); return 1 }

    let dirs = 0
    let files = 0

    const walk = (dir: DirInode, prefix: string, out: Writer) => {
      const entries = [...dir.children.values()]
        .filter(e => !e.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name))

      entries.forEach((entry, i) => {
        const last = i === entries.length - 1
        out.writeText(prefix + (last ? '└── ' : '├── '))
        out.writeLine(entry.name, entry.kind === 'dir' ? DIR_STYLE : undefined)
        if (entry.kind === 'dir') {
          dirs++
          walk(entry, prefix + (last ? '    ' : '│   '), out)
        } else files++
      })
    }

    io.stdout.writeLine(target)
    walk(st, '', io.stdout)
    io.stdout.writeText('\n')
    io.stdout.writeLine(
      `${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`,
    )
    return 0
  },
}
```

`src/commands/fs/find.ts`：

```ts
import { completePath } from '../../core/complete'
import type { Inode } from '../../core/vfs/vfs'
import type { Process } from '../../core/process'

/** 把 glob 模式转成正则。与 expand.ts 中的规则保持一致。 */
function toRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

export const find: Process = {
  name: 'find',
  description: '递归查找文件',
  usage: 'find [起点] [-name 模式]',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const args = io.argv.slice(1)
    const nameIdx = args.indexOf('-name')
    const pattern = nameIdx >= 0 ? args[nameIdx + 1] : undefined
    if (nameIdx >= 0 && pattern === undefined) {
      io.stderr.writeLine('find: -name 缺少参数')
      return 2
    }
    const start = (nameIdx === 0 ? undefined : args[0]) ?? '.'

    const abs = ctx.vfs.resolve(ctx.cwd, start)
    const st = ctx.vfs.stat(abs)
    if (!st) {
      io.stderr.writeLine(`find: '${start}': No such file or directory`)
      return 1
    }

    const re = pattern !== undefined ? toRegex(pattern) : null

    const walk = (inode: Inode, path: string) => {
      if (!re || re.test(inode.name)) io.stdout.writeLine(path)
      if (inode.kind !== 'dir') return
      for (const child of [...inode.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        walk(child, `${path}/${child.name}`)
      }
    }

    // 起点自身用用户给的名字表示；根节点名为 '/'，此时不做名字匹配
    if (!re || re.test(st.kind === 'dir' && start === '.' ? '.' : st.name)) {
      io.stdout.writeLine(start)
    }
    if (st.kind === 'dir') {
      for (const child of [...st.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        walk(child, `${start}/${child.name}`)
      }
    }
    return 0
  },
}
```

`src/commands/fs/touch.ts`：

```ts
import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import type { Process } from '../../core/process'

export const touch: Process = {
  name: 'touch',
  description: '创建空文件或更新时间戳',
  usage: 'touch 文件...',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const targets = io.argv.slice(1)
    if (targets.length === 0) { io.stderr.writeLine('用法: touch 文件...'); return 2 }

    let code = 0
    for (const t of targets) {
      try {
        ctx.vfs.touch(ctx.vfs.resolve(ctx.cwd, t))
      } catch (e) {
        io.stderr.writeLine(formatError('touch', e))
        code = 1
      }
    }
    return code
  },
}
```

`src/commands/fs/mkdir.ts`：

```ts
import { parseFlags } from '../lib'
import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import type { Process } from '../../core/process'

export const mkdir: Process = {
  name: 'mkdir',
  description: '创建目录',
  usage: 'mkdir [-p] 目录...',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx, { dirsOnly: true }) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['p'])
    if (bad) { io.stderr.writeLine(`mkdir: invalid option -- '${bad}'`); return 2 }
    if (operands.length === 0) { io.stderr.writeLine('用法: mkdir [-p] 目录...'); return 2 }

    let code = 0
    for (const t of operands) {
      try {
        ctx.vfs.mkdir(ctx.vfs.resolve(ctx.cwd, t), flags.has('p'))
      } catch (e) {
        io.stderr.writeLine(formatError('mkdir', e))
        code = 1
      }
    }
    return code
  },
}
```

`src/commands/fs/rm.ts`：

```ts
import { parseFlags } from '../lib'
import { formatError } from '../../core/errors'
import { completePath } from '../../core/complete'
import { VfsError } from '../../core/vfs/vfs'
import type { Process } from '../../core/process'

export const rm: Process = {
  name: 'rm',
  description: '删除文件或目录',
  usage: 'rm [-rf] 路径...',
  complete(argv, ctx) { return completePath(argv[argv.length - 1] ?? '', ctx) },

  async run(io, ctx) {
    const { flags, operands, bad } = parseFlags(io.argv, ['r', 'f'])
    if (bad) { io.stderr.writeLine(`rm: invalid option -- '${bad}'`); return 2 }

    const force = flags.has('f')
    if (operands.length === 0) {
      if (force) return 0
      io.stderr.writeLine('用法: rm [-rf] 路径...')
      return 2
    }

    let code = 0
    for (const t of operands) {
      const abs = ctx.vfs.resolve(ctx.cwd, t)
      const st = ctx.vfs.stat(abs)

      if (!st) {
        if (force) continue
        io.stderr.writeLine(`rm: ${t}: No such file or directory`)
        code = 1
        continue
      }
      if (st.kind === 'dir' && !flags.has('r')) {
        io.stderr.writeLine(`rm: ${t}: Is a directory`)
        code = 1
        continue
      }
      try {
        ctx.vfs.remove(abs, flags.has('r'))
      } catch (e) {
        // 根目录的 EPERM 即使加了 -f 也要报出来
        if (e instanceof VfsError && e.code === 'EPERM') {
          io.stderr.writeLine(formatError('rm', e))
          code = 1
          continue
        }
        if (force) continue
        io.stderr.writeLine(formatError('rm', e))
        code = 1
      }
    }
    return code
  },
}
```

- [ ] **Step 4: 登记并运行测试**

把 `tree, find, touch, mkdir, rm` 追加到 `src/commands/index.ts` 的 `builtins` 数组。

Run: `pnpm test src/commands/`
Expected: PASS。`tree` 的输出是逐字符比对，若失败先 `console.log` 实际字符串核对制表符。

- [ ] **Step 5: 提交**

```bash
git add src/commands
git commit -m "feat: 目录树与文件写入命令"
```

---

### Task 15: 系统命令

**Files:**
- Modify: `src/core/process.ts`（给 `Process` 加 `hidden?: boolean`）
- Create: `src/commands/sys/help.ts`, `man.ts`, `whoami.ts`, `uname.ts`, `date.ts`, `env.ts`, `export.ts`, `which.ts`, `history.ts`, `clear.ts`
- Modify: `src/commands/index.ts`
- Test: `src/commands/sys/sys.test.ts`

**Interfaces:**
- Consumes: `Registry`、`Host`、`Env`（Task 1）
- Produces: `help`, `man`, `whoami`, `uname`, `date`, `env`, `exportCmd`, `which`, `history`, `clear`

**契约变更：** `Process` 增加可选字段 `hidden?: boolean`。`help` 跳过 `hidden` 为真的命令 —— 这是 Task 24 彩蛋不出现在帮助里的机制。变量名用 `exportCmd` 因为 `export` 是保留字。

- [ ] **Step 1: 修改契约**

在 `src/core/process.ts` 的 `Process` 接口中，`usage?: string` 之后加：

```ts
  hidden?: boolean          // 为真时不出现在 help 列表中（彩蛋命令用）
```

- [ ] **Step 2: 写失败的测试**

`src/commands/sys/sys.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { help } from './help'
import { man } from './man'
import { whoami } from './whoami'
import { uname } from './uname'
import { date } from './date'
import { env as envCmd } from './env'
import { exportCmd } from './export'
import { which } from './which'
import { history } from './history'
import { clear } from './clear'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx, Process } from '../../core/process'

let ctx: Ctx

const visible: Process = { name: 'visible', description: '看得见', async run() { return 0 } }
const secret: Process = { name: 'secret', description: '看不见', hidden: true, async run() { return 0 } }
const documented: Process = {
  name: 'documented', description: '有文档', usage: 'documented [选项]', async run() { return 0 },
}

beforeEach(() => {
  ctx = makeTestCtx()
  for (const p of [visible, secret, documented, help, man, which]) ctx.registry.register(p)
})

describe('help', () => {
  it('列出可见命令及其描述', async () => {
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain('visible')
    expect(r.out).toContain('看得见')
  })

  it('不列出 hidden 命令', async () => {
    expect((await runCmd(help, ['help'], ctx)).out).not.toContain('secret')
  })
})

describe('man', () => {
  it('显示命令的 usage', async () => {
    expect((await runCmd(man, ['man', 'documented'], ctx)).out).toContain('documented [选项]')
  })

  it('没有 usage 时回落到描述', async () => {
    expect((await runCmd(man, ['man', 'visible'], ctx)).out).toContain('看得见')
  })

  it('命令不存在时返回 1', async () => {
    const r = await runCmd(man, ['man', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('No manual entry')
  })

  it('无参数返回 2', async () => {
    expect((await runCmd(man, ['man'], ctx)).code).toBe(2)
  })
})

describe('whoami / uname / date', () => {
  it('whoami 输出 USER', async () => {
    expect((await runCmd(whoami, ['whoami'], ctx)).out).toBe('guest\n')
  })

  it('uname 默认输出 Linux', async () => {
    expect((await runCmd(uname, ['uname'], ctx)).out).toBe('Linux\n')
  })

  it('uname -a 输出完整串', async () => {
    expect((await runCmd(uname, ['uname', '-a'], ctx)).out).toContain('terminal')
  })

  it('date 输出可解析的时间', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T10:00:00Z'))
    const r = await runCmd(date, ['date'], ctx)
    expect(r.out).toContain('2026')
    vi.useRealTimers()
  })
})

describe('env / export', () => {
  it('env 按字典序列出变量', async () => {
    const lines = (await runCmd(envCmd, ['env'], ctx)).out.trim().split('\n')
    expect(lines).toContain('USER=guest')
    expect([...lines].sort()).toEqual(lines)
  })

  it('export 设置变量', async () => {
    await runCmd(exportCmd, ['export', 'FOO=bar'], ctx)
    expect(ctx.env.get('FOO')).toBe('bar')
  })

  it('export 的值可以含等号', async () => {
    await runCmd(exportCmd, ['export', 'A=b=c'], ctx)
    expect(ctx.env.get('A')).toBe('b=c')
  })

  it('export 参数缺少等号时返回 2', async () => {
    expect((await runCmd(exportCmd, ['export', 'FOO'], ctx)).code).toBe(2)
  })
})

describe('which / history / clear', () => {
  it('which 找到已注册的命令', async () => {
    expect((await runCmd(which, ['which', 'visible'], ctx)).out).toBe('/usr/bin/visible\n')
  })

  it('which 找不到时返回 1', async () => {
    expect((await runCmd(which, ['which', 'nope'], ctx)).code).toBe(1)
  })

  it('history 带序号列出历史', async () => {
    ctx.history.push('ls', 'pwd')
    expect((await runCmd(history, ['history'], ctx)).out).toBe('    1  ls\n    2  pwd\n')
  })

  it('clear 调用 host.clear', async () => {
    const spy = vi.spyOn(ctx.host, 'clear')
    await runCmd(clear, ['clear'], ctx)
    expect(spy).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test src/commands/sys/`
Expected: FAIL —— 找不到 `./help` 等模块。

- [ ] **Step 4: 实现**

`src/commands/sys/help.ts`：

```ts
import type { Process, Style } from '../../core/process'

const NAME_STYLE: Style = { color: 'green', bold: true }

export const help: Process = {
  name: 'help',
  description: '列出可用命令',
  usage: 'help',

  async run(io, ctx) {
    const cmds = ctx.registry.list().filter(p => !p.hidden)
    const width = Math.max(...cmds.map(c => c.name.length), 0)

    io.stdout.writeLine('可用命令：')
    io.stdout.writeText('\n')
    for (const c of cmds) {
      io.stdout.writeText('  ')
      io.stdout.writeText(c.name.padEnd(width), NAME_STYLE)
      io.stdout.writeLine('  ' + c.description)
    }
    io.stdout.writeText('\n')
    io.stdout.writeLine("输入 `man <命令>` 查看用法，Tab 键补全，↑↓ 翻历史。", { dim: true })
    return 0
  },
}
```

`src/commands/sys/man.ts`：

```ts
import type { Process, Style } from '../../core/process'

const HEADING: Style = { bold: true }

export const man: Process = {
  name: 'man',
  description: '查看命令用法',
  usage: 'man 命令',
  complete(argv, ctx) {
    const frag = argv[argv.length - 1] ?? ''
    return ctx.registry.list().filter(p => !p.hidden && p.name.startsWith(frag)).map(p => p.name)
  },

  async run(io, ctx) {
    const name = io.argv[1]
    if (name === undefined) { io.stderr.writeLine('用法: man 命令'); return 2 }

    const proc = ctx.registry.get(name)
    if (!proc) { io.stderr.writeLine(`No manual entry for ${name}`); return 1 }

    io.stdout.writeLine('名称', HEADING)
    io.stdout.writeLine(`    ${proc.name} —— ${proc.description}`)
    io.stdout.writeText('\n')
    io.stdout.writeLine('用法', HEADING)
    io.stdout.writeLine(`    ${proc.usage ?? proc.name}`)
    return 0
  },
}
```

`src/commands/sys/whoami.ts`：

```ts
import type { Process } from '../../core/process'

export const whoami: Process = {
  name: 'whoami',
  description: '显示当前用户',
  usage: 'whoami',
  async run(io, ctx) {
    io.stdout.writeLine(ctx.env.get('USER') ?? 'guest')
    return 0
  },
}
```

`src/commands/sys/uname.ts`：

```ts
import type { Process } from '../../core/process'

export const uname: Process = {
  name: 'uname',
  description: '显示系统信息',
  usage: 'uname [-a]',
  async run(io, ctx) {
    if (io.argv.includes('-a')) {
      const host = ctx.env.get('HOSTNAME') ?? 'terminal'
      io.stdout.writeLine(`Linux ${host} 6.6.0-web #1 SMP PREEMPT_DYNAMIC wasm32 GNU/Linux`)
    } else {
      io.stdout.writeLine('Linux')
    }
    return 0
  },
}
```

`src/commands/sys/date.ts`：

```ts
import type { Process } from '../../core/process'

export const date: Process = {
  name: 'date',
  description: '显示当前时间',
  usage: 'date',
  async run(io) {
    io.stdout.writeLine(new Date().toString())
    return 0
  },
}
```

`src/commands/sys/env.ts`：

```ts
import type { Process } from '../../core/process'

export const env: Process = {
  name: 'env',
  description: '列出环境变量',
  usage: 'env',
  async run(io, ctx) {
    for (const [k, v] of Object.entries(ctx.env.all()).sort(([a], [b]) => a.localeCompare(b))) {
      io.stdout.writeLine(`${k}=${v}`)
    }
    return 0
  },
}
```

`src/commands/sys/export.ts`：

```ts
import type { Process } from '../../core/process'

/** 变量名不叫 export，那是保留字。 */
export const exportCmd: Process = {
  name: 'export',
  description: '设置环境变量',
  usage: 'export 名称=值',
  async run(io, ctx) {
    const arg = io.argv[1]
    if (arg === undefined) { io.stderr.writeLine('用法: export 名称=值'); return 2 }

    const eq = arg.indexOf('=')
    if (eq <= 0) { io.stderr.writeLine(`export: ${arg}: 需要 名称=值 的形式`); return 2 }

    ctx.env.set(arg.slice(0, eq), arg.slice(eq + 1))
    return 0
  },
}
```

`src/commands/sys/which.ts`：

```ts
import type { Process } from '../../core/process'

export const which: Process = {
  name: 'which',
  description: '查找命令位置',
  usage: 'which 命令',
  async run(io, ctx) {
    const name = io.argv[1]
    if (name === undefined) { io.stderr.writeLine('用法: which 命令'); return 2 }
    if (!ctx.registry.get(name)) { io.stderr.writeLine(`which: no ${name} in PATH`); return 1 }
    io.stdout.writeLine(`/usr/bin/${name}`)
    return 0
  },
}
```

`src/commands/sys/history.ts`：

```ts
import type { Process } from '../../core/process'

export const history: Process = {
  name: 'history',
  description: '显示命令历史',
  usage: 'history',
  async run(io, ctx) {
    ctx.history.forEach((line, i) => {
      io.stdout.writeLine(`${String(i + 1).padStart(5)}  ${line}`)
    })
    return 0
  },
}
```

`src/commands/sys/clear.ts`：

```ts
import type { Process } from '../../core/process'

export const clear: Process = {
  name: 'clear',
  description: '清空屏幕',
  usage: 'clear',
  async run(_io, ctx) {
    ctx.host.clear()
    return 0
  },
}
```

- [ ] **Step 5: 登记并运行测试**

把这十个命令追加到 `src/commands/index.ts`（`export` 以 `exportCmd` 导入）。

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 系统类命令"
```

---
### Task 16: React 渲染层与内核桥接

内核到此为止已完工。本任务把它接到 React，但**不写输入框** —— 输入行的 IME 与移动端问题足够复杂，单独放在 Task 17。

**Files:**
- Create: `src/ui/host.ts`
- Create: `src/ui/types.ts`
- Create: `src/ui/blockWriter.ts`
- Create: `src/ui/useTerminal.ts`
- Create: `src/ui/ChunkView.tsx`
- Create: `src/ui/OutputBlock.tsx`
- Create: `src/styles/terminal.css`
- Test: `src/ui/useTerminal.test.tsx`

**Interfaces:**
- Consumes: `createKernel`（Task 11）、`builtins`（Task 15）、`loadContent`（Task 6）
- Produces:
  - `UiHooks = { clear(): void; setTheme(n: string): void; listThemes(): string[]; currentTheme(): string }`
  - `createUiHost(box: { current: UiHooks }): Host`
  - `Block = { id: string; prompt: string; input: string; chunks: Chunk[]; exitCode: number | null }`
  - `createBlockWriter(blockId, setBlocks): Writer & { flushNow(): void }`
  - `useTerminal(): { blocks, running, prompt, submit(line), interrupt(), complete(line) }`
  - `<ChunkView chunk={...} />`、`<OutputBlock block={...} />`

**两个必须做对的点：**

1. **输出批量化。** 一条命令同步写 200 行时不能触发 200 次 setState。写入先进缓冲，用 `queueMicrotask` 合并成一次更新；命令结束时再显式 `flushNow()` 补上尾巴。
2. **`host` 的实现要能在不重建内核的前提下更新。** 内核在 `useRef` 里创建一次，`host` 通过一个可变的 `box.current` 间接调用最新的 React 回调 —— 否则 `clear` 会捕获到过期的 setState 闭包。

- [ ] **Step 1: 写失败的测试**

`src/ui/useTerminal.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTerminal } from './useTerminal'
import { chunkToText } from '../core/process'

const outputOf = (blocks: { chunks: unknown[] }[]) =>
  blocks.flatMap(b => b.chunks).map(c => chunkToText(c as never)).join('')

describe('useTerminal', () => {
  it('初始没有任何 block', () => {
    const { result } = renderHook(() => useTerminal())
    expect(result.current.blocks).toEqual([])
  })

  it('提交命令后产生一个 block 并带上输出', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo hello') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(1))
    await waitFor(() => expect(outputOf(result.current.blocks)).toBe('hello\n'))
  })

  it('block 记录提交时刻的提示符与原始输入', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo hi') })
    await waitFor(() => expect(result.current.blocks[0]!.input).toBe('echo hi'))
    expect(result.current.blocks[0]!.prompt).toContain('guest@terminal')
  })

  it('命令结束后写回退出码', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('nosuchcmd') })
    await waitFor(() => expect(result.current.blocks[0]!.exitCode).toBe(127))
  })

  it('running 在命令执行期间为真，结束后为假', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo x') })
    await waitFor(() => expect(result.current.running).toBe(false))
    expect(result.current.blocks[0]!.exitCode).toBe(0)
  })

  it('clear 命令清空全部 block', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('echo a') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(1))
    act(() => { result.current.submit('clear') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(0))
  })

  it('提示符随 cd 更新', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('cd projects') })
    await waitFor(() => expect(result.current.prompt).toContain('~/projects'))
  })

  it('空输入也产生一个 block（保留视觉上的空行）', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('') })
    await waitFor(() => expect(result.current.blocks).toHaveLength(1))
  })

  it('内容来自真实的 content 目录', async () => {
    const { result } = renderHook(() => useTerminal())
    act(() => { result.current.submit('cat about.md') })
    await waitFor(() => expect(outputOf(result.current.blocks)).toContain('关于我'))
  })

  it('complete 代理到内核', () => {
    const { result } = renderHook(() => useTerminal())
    expect(result.current.complete('ech').candidates).toContain('echo')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/ui/useTerminal.test.tsx`
Expected: FAIL —— 找不到 `./useTerminal`。

- [ ] **Step 3: 实现 host.ts**

`src/ui/host.ts`：

```ts
import type { Host } from '../core/process'

export type UiHooks = {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
}

/**
 * 内核只持有这个 Host 一次，但它每次调用都转发到 box.current 上的最新实现。
 * 没有这层间接，clear() 会捕获到首次渲染时的过期 setState 闭包。
 */
export function createUiHost(box: { current: UiHooks }): Host {
  return {
    clear() { box.current.clear() },
    setTheme(name) { box.current.setTheme(name) },
    listThemes() { return box.current.listThemes() },
    currentTheme() { return box.current.currentTheme() },
  }
}
```

- [ ] **Step 4: 实现 blockWriter.ts**

`src/ui/blockWriter.ts`：

```ts
import { text, type Chunk, type Writer } from '../core/process'
import type { Block } from './types'

type SetBlocks = (updater: (prev: Block[]) => Block[]) => void

/**
 * 把写入缓冲到微任务边界再一次性提交，避免逐行 setState。
 * 命令结束时调用 flushNow() 补上最后一批。
 */
export function createBlockWriter(
  blockId: string,
  setBlocks: SetBlocks,
): Writer & { flushNow(): void } {
  let pending: Chunk[] = []
  let scheduled = false

  const flush = () => {
    scheduled = false
    if (pending.length === 0) return
    const batch = pending
    pending = []
    setBlocks(prev =>
      prev.map(b => (b.id === blockId ? { ...b, chunks: [...b.chunks, ...batch] } : b)),
    )
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(flush)
  }

  const w: Writer & { flushNow(): void } = {
    write(c) { pending.push(c); schedule() },
    writeText(s, style) { w.write(text(s, style)) },
    writeLine(s, style) { w.write(text(s + '\n', style)) },
    close() { flush() },
    flushNow() { flush() },
  }
  return w
}
```

`src/ui/types.ts`：

```ts
import type { Chunk } from '../core/process'

export type Block = {
  id: string
  prompt: string
  input: string
  chunks: Chunk[]
  exitCode: number | null
}
```

- [ ] **Step 5: 实现 useTerminal.ts**

`src/ui/useTerminal.ts`：

```ts
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

  // host 的实现每次渲染都刷新，但内核只创建一次
  const hooksBox = useRef<{ current: UiHooks }>({
    current: {
      clear() { setBlocks([]) },
      setTheme() { /* Task 19 接入 */ },
      listThemes() { return [] },
      currentTheme() { return '' },
    },
  }).current

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
```

**注意：** `hooksBox.current.clear` 里的 `setBlocks` 是 React 保证稳定的 setState 函数，因此这里不需要每次渲染重新赋值。Task 19 引入主题时会在 effect 里更新 `hooksBox.current`，那时才真正用到这层间接。

- [ ] **Step 6: 实现渲染组件**

`src/ui/ChunkView.tsx`：

```tsx
import type { Chunk, Style } from '../core/process'

function classesFor(style: Style): string {
  const cs: string[] = []
  if (style.color) cs.push(`t-${style.color}`)
  if (style.bold) cs.push('t-bold')
  if (style.dim) cs.push('t-dim')
  if (style.underline) cs.push('t-underline')
  return cs.join(' ')
}

export function ChunkView({ chunk }: { chunk: Chunk }) {
  if (chunk.type === 'node') return <>{chunk.node}</>
  if (!chunk.style) return <>{chunk.text}</>
  return <span className={classesFor(chunk.style)}>{chunk.text}</span>
}
```

`src/ui/OutputBlock.tsx`：

```tsx
import { ChunkView } from './ChunkView'
import type { Block } from './types'

export function OutputBlock({ block }: { block: Block }) {
  return (
    <div className="block">
      <div className="block-input">
        <span className="prompt">{block.prompt}</span>
        <span>{block.input}</span>
      </div>
      {block.chunks.length > 0 && (
        <div className="block-output">
          {block.chunks.map((c, i) => <ChunkView key={i} chunk={c} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: 写基础样式**

`src/styles/terminal.css`：

```css
.terminal {
  height: 100%;
  overflow-y: auto;
  padding: 1rem;
  font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas,
               "Noto Sans Mono CJK SC", "Microsoft YaHei Mono", monospace;
  font-size: 14px;
  line-height: 1.5;
  background: var(--bg);
  color: var(--fg);
}

/* 输出必须保留空白与换行，同时允许长行横向滚动而不破坏对齐 */
.block-output,
.block-input {
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt { color: var(--prompt); font-weight: 600; }

.t-bold { font-weight: 700; }
.t-dim { opacity: 0.6; }
.t-underline { text-decoration: underline; }
.t-red { color: var(--red); }
.t-green { color: var(--green); }
.t-yellow { color: var(--yellow); }
.t-blue { color: var(--blue); }
.t-magenta { color: var(--magenta); }
.t-cyan { color: var(--cyan); }
```

在 `src/styles/global.css` 顶部加 `@import './terminal.css';`，并定义一组临时的 CSS 变量占位（Task 19 会用真正的主题替换）：

```css
:root {
  --bg: #16161e;
  --fg: #c0caf5;
  --prompt: #9ece6a;
  --red: #f7768e;
  --green: #9ece6a;
  --yellow: #e0af68;
  --blue: #7aa2f7;
  --magenta: #bb9af7;
  --cyan: #7dcfff;
}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `pnpm test src/ui/`
Expected: PASS。若 `cat about.md` 一测失败，说明 `loadContent()` 的 glob 在 vitest 下没生效 —— 回头检查 Task 6 Step 7 的那个测试。

- [ ] **Step 9: 提交**

```bash
git add src/ui src/styles
git commit -m "feat: React 渲染层与内核桥接"
```

---

### Task 17: 输入行

**Files:**
- Create: `src/ui/PromptLine.tsx`
- Create: `src/ui/Terminal.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/PromptLine.test.tsx`

**Interfaces:**
- Consumes: `useTerminal`（Task 16）
- Produces: `<PromptLine prompt value onChange onSubmit ... />`、`<Terminal />`

**硬约束（Global Constraints 的延伸，实现时不得绕开）：**

必须用**隐藏的真实 `<input>` + CSS 自绘光标**。不用 `contenteditable`，不用纯 `keydown` 拼字符串。理由：

- 中文输入法在候选阶段会持续修改 input 值，只有真 input 能通过 `compositionstart`/`compositionend` 正确区分「正在拼字」和「已上屏」。用 keydown 拼字符串会把候选词的每次按键都当成输入。
- 移动端虚拟键盘只有在真 input 获得焦点时才弹出。

隐藏方式用 `opacity: 0` 加绝对定位覆盖，**不能用 `display: none` 或 `visibility: hidden`** —— 那样元素无法聚焦。

- [ ] **Step 1: 写失败的测试**

`src/ui/PromptLine.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptLine } from './PromptLine'

function setup(overrides: Partial<Parameters<typeof PromptLine>[0]> = {}) {
  const onSubmit = vi.fn()
  const onChange = vi.fn()
  render(
    <PromptLine
      prompt="guest@terminal:~$ "
      value=""
      onChange={onChange}
      onSubmit={onSubmit}
      onHistoryPrev={vi.fn()}
      onHistoryNext={vi.fn()}
      onComplete={vi.fn()}
      onInterrupt={vi.fn()}
      onClearScreen={vi.fn()}
      onReverseSearch={vi.fn()}
      {...overrides}
    />,
  )
  return { onSubmit, onChange, input: screen.getByRole('textbox') }
}

describe('PromptLine', () => {
  it('渲染提示符', () => {
    setup()
    expect(screen.getByText('guest@terminal:~$ ')).toBeTruthy()
  })

  it('用的是真实的 input 元素，不是 contenteditable', () => {
    const { input } = setup()
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('contenteditable')).toBeNull()
  })

  it('输入时回调 onChange', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'ls' } })
    expect(onChange).toHaveBeenCalledWith('ls')
  })

  it('回车时提交当前值', () => {
    const { input, onSubmit } = setup({ value: 'ls -la' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('ls -la')
  })

  it('输入法组合期间回车不提交', () => {
    const { input, onSubmit } = setup({ value: '你好' })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('你好')
  })

  it('组合期间 Tab 不触发补全', () => {
    const onComplete = vi.fn()
    const { input } = setup({ onComplete })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('渲染出可见的自绘光标', () => {
    const { container } = render(
      <PromptLine
        prompt="$ " value="ab" onChange={vi.fn()} onSubmit={vi.fn()}
        onHistoryPrev={vi.fn()} onHistoryNext={vi.fn()}
        onComplete={vi.fn()} onInterrupt={vi.fn()}
        onClearScreen={vi.fn()} onReverseSearch={vi.fn()}
      />,
    )
    expect(container.querySelector('.cursor')).toBeTruthy()
  })

  it('真 input 是透明但可聚焦的', () => {
    const { input } = setup()
    const style = getComputedStyle(input)
    expect(style.display).not.toBe('none')
    expect(style.visibility).not.toBe('hidden')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/ui/PromptLine.test.tsx`
Expected: FAIL —— 找不到 `./PromptLine`。

- [ ] **Step 3: 实现 PromptLine**

`src/ui/PromptLine.tsx`：

```tsx
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
```

追加到 `src/styles/terminal.css`：

```css
.promptline { position: relative; display: flex; white-space: pre-wrap; word-break: break-word; }
.promptline-text { flex: 1; }

/* 透明覆盖层：接管所有键盘与 IME 事件，但视觉上不存在 */
.promptline-input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  color: inherit;
  caret-color: transparent;
}

.cursor {
  background: var(--cursor);
  color: var(--bg);
  animation: blink 1.1s step-end infinite;
}

@keyframes blink { 50% { background: transparent; color: inherit; } }

@media (prefers-reduced-motion: reduce) {
  .cursor { animation: none; }
}
```

`--cursor` 变量加进 `src/styles/global.css` 的 `:root`，值 `#c0caf5`。

- [ ] **Step 4: 组装 Terminal**

`src/ui/Terminal.tsx`：

```tsx
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
```

`src/App.tsx` 改为：

```tsx
import { Terminal } from './ui/Terminal'

export default function App() {
  return <Terminal />
}
```

- [ ] **Step 5: 运行测试并手动验证**

Run: `pnpm test src/ui/`
Expected: PASS。

再跑 `pnpm dev`，在浏览器里确认三件事：
1. 光标闪烁，打字有反应。
2. 切到中文输入法打「你好」，候选阶段不上屏，回车后正确输入。
3. `cat about.md` 能看到内容，`ls | wc -l` 得到数字。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 输入行与终端组装"
```

---

### Task 18: 键位、历史与 Tab 补全

**Files:**
- Create: `src/ui/useHistory.ts`
- Create: `src/ui/useReverseSearch.ts`
- Create: `src/ui/useCompletion.ts`
- Modify: `src/ui/PromptLine.tsx`（补齐全部键位）
- Modify: `src/ui/Terminal.tsx`（接线）
- Test: `src/ui/useHistory.test.tsx`
- Test: `src/ui/useReverseSearch.test.tsx`
- Test: `src/ui/keys.test.tsx`

**Interfaces:**
- Consumes: `useTerminal().complete`（Task 16）
- Produces:
  - `useHistory(entries: string[]): { prev(current: string): string; next(): string; reset(): void }`
  - `useReverseSearch(entries: string[]): { active: boolean; query: string; match: string; start(): void; type(q: string): void; next(): void; accept(): string; cancel(): void }`
  - `useCompletion(complete): (line: string) => { line: string; hint: string[] }`

**键位表（全部要实现）：** Enter 执行；↑/↓ 历史；Tab 补全；**Ctrl+R 历史反向搜索**；Ctrl+C 中断或清空当前行；Ctrl+L 清屏；Ctrl+A/E 行首行尾；Ctrl+U/K 删至行首/行尾；Ctrl+W 删除前一个词。

**Tab 补全规则（与 bash 一致）：** 唯一候选直接补全并在其后补一个空格（目录候选补斜杠而不是空格）；多个候选时补全公共前缀并列出候选。

- [ ] **Step 1: 写失败的测试**

`src/ui/useHistory.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistory } from './useHistory'

describe('useHistory', () => {
  it('↑ 从最新一条开始倒着走', () => {
    const { result } = renderHook(() => useHistory(['a', 'b', 'c']))
    act(() => { expect(result.current.prev('')).toBe('c') })
    act(() => { expect(result.current.prev('')).toBe('b') })
  })

  it('走到最旧一条后停住', () => {
    const { result } = renderHook(() => useHistory(['a']))
    act(() => { result.current.prev('') })
    act(() => { expect(result.current.prev('')).toBe('a') })
  })

  it('↓ 走回来，走过头时恢复为未提交的草稿', () => {
    const { result } = renderHook(() => useHistory(['a', 'b']))
    act(() => { result.current.prev('draft') })
    act(() => { expect(result.current.next()).toBe('draft') })
  })

  it('历史为空时 ↑ 返回原值', () => {
    const { result } = renderHook(() => useHistory([]))
    act(() => { expect(result.current.prev('typed')).toBe('typed') })
  })

  it('reset 后重新从最新一条开始', () => {
    const { result } = renderHook(() => useHistory(['a', 'b']))
    act(() => { result.current.prev('') })
    act(() => { result.current.reset() })
    act(() => { expect(result.current.prev('')).toBe('b') })
  })
})
```

`src/ui/keys.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptLine } from './PromptLine'

function setup(value: string) {
  const onChange = vi.fn()
  const onClear = vi.fn()
  const onInterrupt = vi.fn()
  render(
    <PromptLine
      prompt="$ " value={value}
      onChange={onChange} onSubmit={vi.fn()}
      onHistoryPrev={vi.fn()} onHistoryNext={vi.fn()}
      onComplete={vi.fn()} onInterrupt={onInterrupt}
      onClearScreen={onClear} onReverseSearch={vi.fn()}
    />,
  )
  return { input: screen.getByRole('textbox'), onChange, onClear, onInterrupt }
}

describe('行编辑键位', () => {
  it('Ctrl+U 删到行首', () => {
    const { input, onChange } = setup('hello world')
    fireEvent.keyDown(input, { key: 'u', ctrlKey: true })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('Ctrl+W 删除前一个词', () => {
    const { input, onChange } = setup('hello world')
    fireEvent.keyDown(input, { key: 'w', ctrlKey: true })
    expect(onChange).toHaveBeenCalledWith('hello ')
  })

  it('Ctrl+W 跳过尾部空格', () => {
    const { input, onChange } = setup('hello world   ')
    fireEvent.keyDown(input, { key: 'w', ctrlKey: true })
    expect(onChange).toHaveBeenCalledWith('hello ')
  })

  it('Ctrl+L 触发清屏', () => {
    const { input, onClear } = setup('x')
    fireEvent.keyDown(input, { key: 'l', ctrlKey: true })
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('Ctrl+C 触发中断', () => {
    const { input, onInterrupt } = setup('x')
    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })
    expect(onInterrupt).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/ui/`
Expected: FAIL —— 找不到 `./useHistory`，`keys.test.tsx` 报 `onClearScreen` 不是合法属性。

- [ ] **Step 3: 实现 useHistory**

`src/ui/useHistory.ts`：

```ts
import { useCallback, useRef } from 'react'

/**
 * bash 风格的历史导航。
 * 游标为 entries.length 表示「不在历史中」，此时显示用户的草稿。
 */
export function useHistory(entries: string[]) {
  const cursor = useRef(entries.length)
  const draft = useRef('')

  const prev = useCallback((current: string) => {
    if (entries.length === 0) return current
    if (cursor.current === entries.length) draft.current = current
    cursor.current = Math.max(0, cursor.current - 1)
    return entries[cursor.current] ?? current
  }, [entries])

  const next = useCallback(() => {
    if (cursor.current >= entries.length) return draft.current
    cursor.current += 1
    if (cursor.current >= entries.length) return draft.current
    return entries[cursor.current] ?? ''
  }, [entries])

  const reset = useCallback(() => {
    cursor.current = entries.length
    draft.current = ''
  }, [entries])

  return { prev, next, reset }
}
```

- [ ] **Step 4: 实现 useCompletion**

`src/ui/useCompletion.ts`：

```ts
import { useCallback } from 'react'

type CompleteFn = (line: string) => { candidates: string[]; replaceFrom: number }

/** 求一组字符串的最长公共前缀。 */
function commonPrefix(items: string[]): string {
  if (items.length === 0) return ''
  let prefix = items[0]!
  for (const s of items.slice(1)) {
    let i = 0
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++
    prefix = prefix.slice(0, i)
  }
  return prefix
}

/**
 * 返回补全后的整行，以及需要展示给用户的候选列表（唯一候选时为空）。
 * 与 bash 一致：唯一候选补一个空格，目录候选已自带斜杠故不补空格。
 */
export function useCompletion(complete: CompleteFn) {
  return useCallback((line: string): { line: string; hint: string[] } => {
    const { candidates, replaceFrom } = complete(line)
    if (candidates.length === 0) return { line, hint: [] }

    const head = line.slice(0, replaceFrom)

    if (candidates.length === 1) {
      const only = candidates[0]!
      const suffix = only.endsWith('/') ? '' : ' '
      return { line: head + only + suffix, hint: [] }
    }

    const shared = commonPrefix(candidates)
    const frag = line.slice(replaceFrom)
    // 公共前缀没能推进时，直接把候选列出来
    return { line: shared.length > frag.length ? head + shared : line, hint: candidates }
  }, [complete])
}
```

- [ ] **Step 4b: 写反向搜索的失败测试**

`src/ui/useReverseSearch.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReverseSearch } from './useReverseSearch'

const ENTRIES = ['ls -la', 'cat about.md', 'grep foo about.md', 'pwd']

describe('useReverseSearch', () => {
  it('初始未激活', () => {
    expect(renderHook(() => useReverseSearch(ENTRIES)).result.current.active).toBe(false)
  })

  it('start 后进入搜索态', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    expect(result.current.active).toBe(true)
  })

  it('从最新一条往回找到第一个包含子串的命令', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('about') })
    expect(result.current.match).toBe('grep foo about.md')
  })

  it('再按一次 Ctrl+R 跳到更旧的一条匹配', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('about') })
    act(() => { result.current.next() })
    expect(result.current.match).toBe('cat about.md')
  })

  it('没有更旧的匹配时停在最后一条', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('about') })
    act(() => { result.current.next() })
    act(() => { result.current.next() })
    expect(result.current.match).toBe('cat about.md')
  })

  it('无匹配时 match 为空', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('zzz') })
    expect(result.current.match).toBe('')
  })

  it('accept 返回当前匹配并退出搜索态', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('pwd') })
    let accepted = ''
    act(() => { accepted = result.current.accept() })
    expect(accepted).toBe('pwd')
    expect(result.current.active).toBe(false)
  })

  it('cancel 退出搜索态并清空查询', () => {
    const { result } = renderHook(() => useReverseSearch(ENTRIES))
    act(() => { result.current.start() })
    act(() => { result.current.type('ls') })
    act(() => { result.current.cancel() })
    expect(result.current.active).toBe(false)
    expect(result.current.query).toBe('')
  })
})
```

- [ ] **Step 4c: 实现 useReverseSearch**

`src/ui/useReverseSearch.ts`：

```ts
import { useCallback, useState } from 'react'

/**
 * bash 的 Ctrl+R：从最新一条往回搜第一个包含查询子串的历史命令。
 * skip 记录已经跳过的匹配数，再按一次 Ctrl+R 就多跳一条。
 */
export function useReverseSearch(entries: string[]) {
  const [active, setActive] = useState(false)
  const [query, setQuery] = useState('')
  const [skip, setSkip] = useState(0)

  const findMatch = useCallback((q: string, s: number): string => {
    if (q === '') return ''
    let seen = 0
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!
      if (!entry.includes(q)) continue
      if (seen === s) return entry
      seen++
    }
    return ''
  }, [entries])

  const match = findMatch(query, skip)

  return {
    active,
    query,
    match,
    start: useCallback(() => { setActive(true); setQuery(''); setSkip(0) }, []),
    type: useCallback((q: string) => { setQuery(q); setSkip(0) }, []),
    // 没有更旧的匹配时原地不动，而不是回绕到最新一条
    next: useCallback(() => {
      setSkip(s => (findMatch(query, s + 1) === '' ? s : s + 1))
    }, [findMatch, query]),
    accept: useCallback(() => {
      setActive(false)
      const result = match
      setQuery('')
      setSkip(0)
      return result
    }, [match]),
    cancel: useCallback(() => { setActive(false); setQuery(''); setSkip(0) }, []),
  }
}
```

- [ ] **Step 5: 补齐 PromptLine 的键位**

`onClearScreen`、`onReverseSearch`、`displayOverride` 这三个 prop 在 Task 17 已经声明，本任务只接上行为。

自绘部分改为读 `displayOverride ?? value`：

```tsx
  const shown = props.displayOverride ?? value
  const before = shown.slice(0, caret)
  const at = shown.slice(caret, caret + 1) || ' '
  const after = shown.slice(caret + 1)
```

然后把 `onKeyDown` 替换为：

```tsx
  const setAndFocus = (next: string, caretAt: number) => {
    onChange(next)
    queueMicrotask(() => {
      inputRef.current?.setSelectionRange(caretAt, caretAt)
      setCaret(caretAt)
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (composing) return          // 输入法候选期间一律放行

    const pos = inputRef.current?.selectionStart ?? value.length

    if (e.key === 'Enter') { e.preventDefault(); onSubmit(value); return }
    if (e.key === 'Escape') { e.preventDefault(); props.onInterrupt(); return }
    if (e.key === 'Tab') { e.preventDefault(); props.onComplete(); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); props.onHistoryPrev(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); props.onHistoryNext(); return }

    if (e.ctrlKey) {
      switch (e.key) {
        case 'c': e.preventDefault(); props.onInterrupt(); return
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
```

- [ ] **Step 6: 在 Terminal 中接线**

`src/ui/Terminal.tsx` 的相关部分改为：

```tsx
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
```

这需要 `useTerminal` 额外导出两项，在 `src/ui/useTerminal.ts` 的返回值中加上：

```ts
    history: kernel.ctx.history,
    clearScreen: useCallback(() => { setBlocks([]) }, []),
```

- [ ] **Step 7: 补样式**

追加到 `src/styles/terminal.css`：

```css
.completion-hint {
  color: var(--fg);
  opacity: 0.65;
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 8: 运行测试并手动验证**

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`
Expected: 全绿。

`pnpm dev` 手动确认：输入 `ca` 按 Tab 补成 `cat `；输入 `a` 按 Tab 列出 `about.md apple.md`；↑ 能翻出上一条命令；Ctrl+W 删掉一个词；跑几条命令后按 Ctrl+R 输入片段能搜到历史，再按一次 Ctrl+R 跳到更旧的一条，Enter 接受、Esc 取消。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "feat: 行编辑键位、历史导航与 Tab 补全"
```

---
### Task 19: 主题系统

**Files:**
- Create: `src/ui/themes.ts`
- Create: `src/ui/useTheme.ts`
- Create: `src/commands/sys/theme.ts`
- Modify: `src/ui/useTerminal.ts`（把主题接进 `hooksBox`）
- Modify: `src/styles/global.css`（删掉临时变量占位）
- Modify: `src/commands/index.ts`
- Test: `src/ui/useTheme.test.tsx`
- Test: `src/commands/sys/theme.test.ts`

**Interfaces:**
- Consumes: `Host`（Task 1）、`hooksBox`（Task 16）
- Produces:
  - `THEMES: Record<string, Record<string, string>>` —— 主题名 → CSS 变量表
  - `useTheme(): { theme: string; setTheme(n: string): void; themes: string[] }`
  - `theme: Process`

主题通过在 `document.documentElement` 上设置 CSS 自定义属性生效，选择存 `localStorage`。`theme` 命令只碰 `ctx.host`，因此它仍是纯 TS，留在 `src/commands/sys/`。

- [ ] **Step 1: 写失败的测试**

`src/ui/useTheme.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'
import { THEMES } from './themes'

beforeEach(() => { localStorage.clear() })

describe('useTheme', () => {
  it('默认使用 tokyo-night', () => {
    expect(renderHook(() => useTheme()).result.current.theme).toBe('tokyo-night')
  })

  it('切换后把变量写到根元素', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setTheme('gruvbox') })
    expect(document.documentElement.style.getPropertyValue('--bg'))
      .toBe(THEMES['gruvbox']!['--bg'])
  })

  it('选择持久化到 localStorage', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setTheme('nord') })
    expect(localStorage.getItem('terminal-theme')).toBe('nord')
  })

  it('启动时读回已保存的主题', () => {
    localStorage.setItem('terminal-theme', 'nord')
    expect(renderHook(() => useTheme()).result.current.theme).toBe('nord')
  })

  it('忽略无效的主题名', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setTheme('不存在的主题') })
    expect(result.current.theme).toBe('tokyo-night')
  })

  it('每个主题都定义了全部必需变量', () => {
    const required = Object.keys(THEMES['tokyo-night']!)
    for (const [name, vars] of Object.entries(THEMES)) {
      expect(Object.keys(vars).sort(), `主题 ${name} 变量不全`).toEqual(required.sort())
    }
  })
})
```

`src/commands/sys/theme.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { theme } from './theme'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('theme', () => {
  it('无参数时列出全部主题并标出当前项', async () => {
    const r = await runCmd(theme, ['theme'], ctx)
    expect(r.out).toContain('dracula')
    expect(r.out).toContain('*')          // 当前主题的标记
  })

  it('切换到已知主题', async () => {
    const spy = vi.spyOn(ctx.host, 'setTheme')
    const r = await runCmd(theme, ['theme', 'nord'], ctx)
    expect(r.code).toBe(0)
    expect(spy).toHaveBeenCalledWith('nord')
  })

  it('未知主题返回 1', async () => {
    const r = await runCmd(theme, ['theme', 'nope'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('nope')
  })

  it('补全提供主题名', () => {
    expect(theme.complete!(['theme', 'n'], ctx)).toContain('nord')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/ui/useTheme.test.tsx src/commands/sys/theme.test.ts`
Expected: FAIL —— 找不到模块。

- [ ] **Step 3: 实现 themes.ts**

`src/ui/themes.ts`：

```ts
/** 每个主题必须定义完全相同的变量集合，缺一个就会露出上一个主题的颜色。 */
export const THEMES: Record<string, Record<string, string>> = {
  'tokyo-night': {
    '--bg': '#1a1b26', '--fg': '#c0caf5', '--cursor': '#c0caf5', '--prompt': '#9ece6a',
    '--red': '#f7768e', '--green': '#9ece6a', '--yellow': '#e0af68',
    '--blue': '#7aa2f7', '--magenta': '#bb9af7', '--cyan': '#7dcfff',
    '--selection': '#33467c',
  },
  dracula: {
    '--bg': '#282a36', '--fg': '#f8f8f2', '--cursor': '#f8f8f2', '--prompt': '#50fa7b',
    '--red': '#ff5555', '--green': '#50fa7b', '--yellow': '#f1fa8c',
    '--blue': '#bd93f9', '--magenta': '#ff79c6', '--cyan': '#8be9fd',
    '--selection': '#44475a',
  },
  nord: {
    '--bg': '#2e3440', '--fg': '#d8dee9', '--cursor': '#d8dee9', '--prompt': '#a3be8c',
    '--red': '#bf616a', '--green': '#a3be8c', '--yellow': '#ebcb8b',
    '--blue': '#81a1c1', '--magenta': '#b48ead', '--cyan': '#88c0d0',
    '--selection': '#434c5e',
  },
  gruvbox: {
    '--bg': '#282828', '--fg': '#ebdbb2', '--cursor': '#ebdbb2', '--prompt': '#b8bb26',
    '--red': '#fb4934', '--green': '#b8bb26', '--yellow': '#fabd2f',
    '--blue': '#83a598', '--magenta': '#d3869b', '--cyan': '#8ec07c',
    '--selection': '#504945',
  },
  'one-dark': {
    '--bg': '#282c34', '--fg': '#abb2bf', '--cursor': '#abb2bf', '--prompt': '#98c379',
    '--red': '#e06c75', '--green': '#98c379', '--yellow': '#e5c07b',
    '--blue': '#61afef', '--magenta': '#c678dd', '--cyan': '#56b6c2',
    '--selection': '#3e4451',
  },
}

export const DEFAULT_THEME = 'tokyo-night'
export const THEME_STORAGE_KEY = 'terminal-theme'
```

- [ ] **Step 4: 实现 useTheme.ts**

`src/ui/useTheme.ts`：

```ts
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from './themes'

function readStored(): string {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return saved && saved in THEMES ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME        // 隐私模式下 localStorage 可能直接抛异常
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<string>(readStored)

  useEffect(() => {
    const vars = THEMES[theme]
    if (!vars) return
    for (const [k, v] of Object.entries(vars)) {
      document.documentElement.style.setProperty(k, v)
    }
  }, [theme])

  const setTheme = useCallback((name: string) => {
    if (!(name in THEMES)) return
    setThemeState(name)
    try { localStorage.setItem(THEME_STORAGE_KEY, name) } catch { /* 忽略写入失败 */ }
  }, [])

  return { theme, setTheme, themes: Object.keys(THEMES) }
}
```

- [ ] **Step 5: 实现 theme 命令**

`src/commands/sys/theme.ts`：

```ts
import type { Process, Style } from '../../core/process'

const ACTIVE: Style = { color: 'green', bold: true }

export const theme: Process = {
  name: 'theme',
  description: '查看或切换配色主题',
  usage: 'theme [主题名]',
  complete(argv, ctx) {
    const frag = argv[argv.length - 1] ?? ''
    return ctx.host.listThemes().filter(t => t.startsWith(frag))
  },

  async run(io, ctx) {
    const available = ctx.host.listThemes()
    const wanted = io.argv[1]

    if (wanted === undefined) {
      const current = ctx.host.currentTheme()
      for (const t of available) {
        const isCurrent = t === current
        io.stdout.writeLine(`  ${isCurrent ? '*' : ' '} ${t}`, isCurrent ? ACTIVE : undefined)
      }
      return 0
    }

    if (!available.includes(wanted)) {
      io.stderr.writeLine(`theme: ${wanted}: 未知主题。可用：${available.join(', ')}`)
      return 1
    }

    ctx.host.setTheme(wanted)
    io.stdout.writeLine(`主题已切换为 ${wanted}`)
    return 0
  },
}
```

- [ ] **Step 6: 把主题接进 useTerminal**

在 `src/ui/useTerminal.ts` 中引入 `useTheme`，并在每次渲染时刷新 `hooksBox.current` —— 这正是 Task 16 那层间接存在的原因：

```ts
  const { theme, setTheme, themes } = useTheme()

  hooksBox.current = {
    clear: () => setBlocks([]),
    setTheme,
    listThemes: () => themes,
    currentTheme: () => theme,
  }
```

把这段放在 `kernelRef` 初始化**之前**，确保内核创建时 `hooksBox.current` 已就绪。

同时把 `theme` 追加进 `src/commands/index.ts` 的 `builtins`，并删掉 `src/styles/global.css` 里 Task 16 留下的临时 `:root` 变量块 —— 现在由 `useTheme` 在运行时注入。为避免首帧无色，在 `index.html` 的 `<head>` 里保留一份内联的默认变量：

```html
    <style>
      :root {
        --bg: #1a1b26; --fg: #c0caf5; --cursor: #c0caf5; --prompt: #9ece6a;
        --red: #f7768e; --green: #9ece6a; --yellow: #e0af68;
        --blue: #7aa2f7; --magenta: #bb9af7; --cyan: #7dcfff; --selection: #33467c;
      }
      body { background: #1a1b26; }
    </style>
```

- [ ] **Step 7: 运行测试并手动验证**

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`
Expected: 全绿。

`pnpm dev` 手动确认：`theme` 列出五个主题；`theme gruvbox` 立刻变色；刷新页面后仍是 gruvbox。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 配色主题系统"
```

---

### Task 20: 富输出命令

**Files:**
- Create: `src/ui/rich/Markdown.tsx`
- Create: `src/ui/rich/ProjectCard.tsx`
- Create: `src/ui/rich/SkillBars.tsx`
- Create: `src/ui/commands/about.tsx`, `projects.tsx`, `skills.tsx`, `contact.tsx`, `resume.tsx`, `open.tsx`
- Create: `src/ui/commands/index.ts`
- Modify: `src/ui/useTerminal.ts`（注册 UI 命令）
- Modify: `src/styles/terminal.css`
- Test: `src/ui/commands/site.test.tsx`

**Interfaces:**
- Consumes: `Process`、`node()`（Task 1）、`skills`（Task 6）
- Produces: `uiCommands: Process[]`

**为什么这些命令不在 `src/commands/`：** 它们需要构造 React 元素，而 Global Constraints 禁止 `src/commands/**` 运行时依赖 React。把它们放在 `src/ui/commands/` 是对这条边界的诚实处理 —— UI 层的命令就该住在 UI 层，而不是给 `src/commands/` 开一个例外口子。内核对两者一视同仁，因为它们实现的是同一个 `Process` 契约。

**每个富输出 chunk 都必须提供 `toText()`**，否则 `projects | grep rust` 会崩。测试要逐条覆盖这一点。

- [ ] **Step 1: 写失败的测试**

`src/ui/commands/site.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { about } from './about'
import { projects } from './projects'
import { skills } from './skills'
import { contact } from './contact'
import { open as openCmd } from './open'
import { makeTestCtx, runCmd } from '../../commands/testkit'
import { chunkToText, type Chunk, type Ctx } from '../../core/process'

const FILES = {
  '/home/guest/about.md': '# 关于我\n\n一名工程师。\n\n- TypeScript\n- Rust\n',
  '/home/guest/contact.md': '# 联系方式\n\n- GitHub: https://github.com/example\n',
  '/home/guest/projects/alpha.md': '# alpha\n\n第一个项目。\n\n- 技术栈：Rust\n- 源码：https://example.com/alpha\n',
  '/home/guest/projects/beta.md': '# beta\n\n第二个项目。\n\n- 技术栈：TypeScript\n',
}

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx(FILES) })

/** 富 chunk 的降级文本 —— 管道下游看到的就是这个 */
const asText = (chunks: Chunk[]) => chunks.map(chunkToText).join('')

describe('about', () => {
  it('输出富节点', async () => {
    const r = await runCmd(about, ['about'], ctx)
    expect(r.code).toBe(0)
    expect(r.chunks.some(c => c.type === 'node')).toBe(true)
  })

  it('降级文本包含正文内容', async () => {
    const r = await runCmd(about, ['about'], ctx)
    expect(asText(r.chunks)).toContain('一名工程师')
  })

  it('about.md 缺失时报错而不是崩溃', async () => {
    const r = await runCmd(about, ['about'], makeTestCtx({}))
    expect(r.code).toBe(1)
    expect(r.err).toContain('about.md')
  })
})

describe('projects', () => {
  it('列出 projects 目录下的全部项目', async () => {
    const text = asText((await runCmd(projects, ['projects'], ctx)).chunks)
    expect(text).toContain('alpha')
    expect(text).toContain('beta')
  })

  it('降级文本可被 grep 命中', async () => {
    const text = asText((await runCmd(projects, ['projects'], ctx)).chunks)
    expect(text.split('\n').some(l => /Rust/.test(l))).toBe(true)
  })

  it('渲染出可点击的源码链接', async () => {
    const r = await runCmd(projects, ['projects'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    const { container } = render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
    const link = container.querySelector('a[href="https://example.com/alpha"]')
    expect(link).toBeTruthy()
    expect(link!.getAttribute('rel')).toContain('noopener')
  })

  it('目录为空时给出提示而不是空输出', async () => {
    const r = await runCmd(projects, ['projects'], makeTestCtx({ '/home/guest/about.md': '' }))
    expect(asText(r.chunks)).toContain('暂无')
  })
})

describe('skills', () => {
  it('按分组输出，且降级文本含等级', async () => {
    const text = asText((await runCmd(skills, ['skills'], ctx)).chunks)
    expect(text).toContain('TypeScript')
    expect(text).toMatch(/TypeScript.*[1-5]/)
  })

  it('渲染出条形图元素', async () => {
    const r = await runCmd(skills, ['skills'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    const { container } = render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
    expect(container.querySelectorAll('.skill-bar').length).toBeGreaterThan(0)
  })
})

describe('contact', () => {
  it('把链接渲染为可点击元素', async () => {
    const r = await runCmd(contact, ['contact'], ctx)
    const nodeChunk = r.chunks.find(c => c.type === 'node')!
    const { container } = render(<>{(nodeChunk as { node: React.ReactNode }).node}</>)
    expect(container.querySelector('a[href="https://github.com/example"]')).toBeTruthy()
  })
})

describe('open', () => {
  it('调用 window.open 并带上安全属性', async () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const r = await runCmd(openCmd, ['open', 'https://example.com'], ctx)
    expect(r.code).toBe(0)
    expect(spy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    spy.mockRestore()
  })

  it('拒绝非 http(s) 协议', async () => {
    const r = await runCmd(openCmd, ['open', 'javascript:alert(1)'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('只支持')
  })

  it('无参数返回 2', async () => {
    expect((await runCmd(openCmd, ['open'], ctx)).code).toBe(2)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/ui/commands/`
Expected: FAIL —— 找不到模块。

- [ ] **Step 3: 实现 Markdown 渲染器**

`src/ui/rich/Markdown.tsx`：

```tsx
import type { ReactNode } from 'react'

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)/g

/** 把一行文本里的 Markdown 链接与裸 URL 渲染成可点击元素。 */
function inline(source: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  LINK_RE.lastIndex = 0

  while ((m = LINK_RE.exec(source)) !== null) {
    if (m.index > last) out.push(source.slice(last, m.index))
    const label = m[1] ?? m[3]!
    const href = m[2] ?? m[3]!
    out.push(
      <a key={`${keyPrefix}-${m.index}`} href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < source.length) out.push(source.slice(last))
  return out
}

/**
 * 极简 Markdown 渲染：标题、无序列表、段落、行内链接。
 * 刻意不支持表格、图片、嵌套列表 —— 简历内容用不到。
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n')
  return (
    <div className="md">
      {lines.map((line, i) => {
        const key = `l${i}`
        if (line.startsWith('### ')) return <div key={key} className="md-h3">{inline(line.slice(4), key)}</div>
        if (line.startsWith('## ')) return <div key={key} className="md-h2">{inline(line.slice(3), key)}</div>
        if (line.startsWith('# ')) return <div key={key} className="md-h1">{inline(line.slice(2), key)}</div>
        if (/^[-*] /.test(line)) return <div key={key} className="md-li">• {inline(line.slice(2), key)}</div>
        if (line.trim() === '') return <div key={key} className="md-blank"> </div>
        return <div key={key}>{inline(line, key)}</div>
      })}
    </div>
  )
}
```

- [ ] **Step 4: 实现 about / contact**

`src/ui/commands/about.tsx`：

```tsx
import { node, type Ctx, type Process } from '../../core/process'
import { Markdown } from '../rich/Markdown'
import { VfsError } from '../../core/vfs/vfs'

function readOrFail(ctx: Ctx, rel: string): string | null {
  try {
    return ctx.vfs.readFile(ctx.vfs.resolve(ctx.env.get('HOME') ?? '/', rel))
  } catch (e) {
    if (e instanceof VfsError) return null
    throw e
  }
}

export const about: Process = {
  name: 'about',
  description: '关于我',
  usage: 'about',

  async run(io, ctx) {
    const source = readOrFail(ctx, 'about.md')
    if (source === null) { io.stderr.writeLine('about: about.md 不存在'); return 1 }
    io.stdout.write(node(<Markdown source={source} />, () => source))
    return 0
  },
}

export { readOrFail }
```

`src/ui/commands/contact.tsx`：

```tsx
import { node, type Process } from '../../core/process'
import { Markdown } from '../rich/Markdown'
import { readOrFail } from './about'

export const contact: Process = {
  name: 'contact',
  description: '联系方式',
  usage: 'contact',

  async run(io, ctx) {
    const source = readOrFail(ctx, 'contact.md')
    if (source === null) { io.stderr.writeLine('contact: contact.md 不存在'); return 1 }
    io.stdout.write(node(<Markdown source={source} />, () => source))
    return 0
  },
}
```

- [ ] **Step 5: 实现 projects**

`src/ui/rich/ProjectCard.tsx`：

```tsx
export type Project = {
  name: string
  summary: string
  meta: { label: string; value: string }[]
}

/** 从一个项目 Markdown 文件解析出结构化数据。 */
export function parseProject(source: string, fallbackName: string): Project {
  const lines = source.split('\n')
  const heading = lines.find(l => l.startsWith('# '))
  const meta = lines
    .filter(l => /^[-*] /.test(l))
    .map(l => {
      const body = l.slice(2)
      const sep = body.search(/[:：]/)
      return sep < 0
        ? { label: '', value: body }
        : { label: body.slice(0, sep).trim(), value: body.slice(sep + 1).trim() }
    })
  const summary = lines.find(l => l.trim() !== '' && !l.startsWith('#') && !/^[-*] /.test(l)) ?? ''
  return { name: heading ? heading.slice(2).trim() : fallbackName, summary: summary.trim(), meta }
}

export function projectToText(p: Project): string {
  const metaLine = p.meta.map(m => (m.label ? `${m.label}: ${m.value}` : m.value)).join('  ')
  return `${p.name}\n  ${p.summary}\n  ${metaLine}\n`
}

const isUrl = (s: string) => /^https?:\/\//.test(s)

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="project-card">
      <div className="project-name">{project.name}</div>
      <div className="project-summary">{project.summary}</div>
      <div className="project-meta">
        {project.meta.map((m, i) => (
          <span key={i} className="project-meta-item">
            {m.label && <span className="project-meta-label">{m.label}: </span>}
            {isUrl(m.value)
              ? <a href={m.value} target="_blank" rel="noopener noreferrer">{m.value}</a>
              : m.value}
          </span>
        ))}
      </div>
    </div>
  )
}
```

`src/ui/commands/projects.tsx`：

```tsx
import { node, type Process } from '../../core/process'
import { ProjectCard, parseProject, projectToText } from '../rich/ProjectCard'

export const projects: Process = {
  name: 'projects',
  description: '我做过的项目',
  usage: 'projects',

  async run(io, ctx) {
    const home = ctx.env.get('HOME') ?? '/'
    const dir = ctx.vfs.resolve(home, 'projects')

    if (!ctx.vfs.isDir(dir)) {
      io.stdout.writeLine('暂无项目。')
      return 0
    }

    const entries = ctx.vfs.list(dir).filter(e => e.kind === 'file' && e.name.endsWith('.md'))
    if (entries.length === 0) {
      io.stdout.writeLine('暂无项目。')
      return 0
    }

    for (const entry of entries) {
      const source = ctx.vfs.readFile(`${dir}/${entry.name}`)
      const project = parseProject(source, entry.name.replace(/\.md$/, ''))
      io.stdout.write(node(
        <ProjectCard key={entry.name} project={project} />,
        () => projectToText(project),
      ))
    }
    return 0
  },
}
```

- [ ] **Step 6: 实现 skills**

`src/ui/rich/SkillBars.tsx`：

```tsx
export type SkillGroup = { name: string; items: { name: string; level: number }[] }

const MAX_LEVEL = 5

export function skillsToText(groups: SkillGroup[]): string {
  return groups
    .map(g => `${g.name}\n` + g.items.map(i => `  ${i.name}  ${i.level}/${MAX_LEVEL}`).join('\n'))
    .join('\n') + '\n'
}

export function SkillBars({ groups }: { groups: SkillGroup[] }) {
  const width = Math.max(...groups.flatMap(g => g.items.map(i => i.name.length)), 0)
  return (
    <div className="skills">
      {groups.map(g => (
        <div key={g.name} className="skill-group">
          <div className="skill-group-name">{g.name}</div>
          {g.items.map(item => (
            <div key={item.name} className="skill-row">
              <span className="skill-name">{item.name.padEnd(width)}</span>
              <span
                className="skill-bar"
                role="img"
                aria-label={`${item.name} ${item.level} / ${MAX_LEVEL}`}
              >
                {'█'.repeat(item.level)}
                <span className="skill-bar-empty">{'░'.repeat(MAX_LEVEL - item.level)}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

`src/ui/commands/skills.tsx`：

```tsx
import { node, type Process } from '../../core/process'
import { SkillBars, skillsToText, type SkillGroup } from '../rich/SkillBars'
import { skills as skillsData } from '../../content'

export const skills: Process = {
  name: 'skills',
  description: '技术栈',
  usage: 'skills',

  async run(io) {
    const groups = skillsData.groups as SkillGroup[]
    io.stdout.write(node(<SkillBars groups={groups} />, () => skillsToText(groups)))
    return 0
  },
}
```

- [ ] **Step 7: 实现 resume 与 open**

`src/ui/commands/resume.tsx`：

```tsx
import { node, type Process } from '../../core/process'
import { Markdown } from '../rich/Markdown'
import { parseProject, projectToText } from '../rich/ProjectCard'
import { skillsToText, type SkillGroup } from '../rich/SkillBars'
import { skills as skillsData } from '../../content'
import { readOrFail } from './about'

/** 把 about / skills / projects 拼成一页可通读的简历。 */
export const resume: Process = {
  name: 'resume',
  description: '一页式简历',
  usage: 'resume',

  async run(io, ctx) {
    const home = ctx.env.get('HOME') ?? '/'
    const about = readOrFail(ctx, 'about.md') ?? ''
    const contact = readOrFail(ctx, 'contact.md') ?? ''

    const dir = ctx.vfs.resolve(home, 'projects')
    const projectTexts = ctx.vfs.isDir(dir)
      ? ctx.vfs.list(dir)
          .filter(e => e.kind === 'file' && e.name.endsWith('.md'))
          .map(e => projectToText(parseProject(
            ctx.vfs.readFile(`${dir}/${e.name}`), e.name.replace(/\.md$/, ''),
          )))
      : []

    const source = [
      about,
      '## 技能',
      skillsToText(skillsData.groups as SkillGroup[]),
      '## 项目',
      ...projectTexts,
      contact,
    ].join('\n')

    io.stdout.write(node(<Markdown source={source} />, () => source))
    return 0
  },
}
```

`src/ui/commands/open.tsx`：

```tsx
import type { Process } from '../../core/process'

export const open: Process = {
  name: 'open',
  description: '在新标签页打开链接',
  usage: 'open https://...',

  async run(io) {
    const url = io.argv[1]
    if (url === undefined) { io.stderr.writeLine('用法: open https://...'); return 2 }

    // 只放行 http(s)，挡掉 javascript: 与 data: 这类协议
    if (!/^https?:\/\//.test(url)) {
      io.stderr.writeLine(`open: 只支持 http 与 https 链接`)
      return 1
    }

    window.open(url, '_blank', 'noopener,noreferrer')
    io.stdout.writeLine(`已在新标签页打开 ${url}`)
    return 0
  },
}
```

- [ ] **Step 8: 汇总并注册**

`src/ui/commands/index.ts`：

```ts
import { about } from './about'
import { projects } from './projects'
import { skills } from './skills'
import { contact } from './contact'
import { resume } from './resume'
import { open } from './open'
import type { Process } from '../../core/process'

/** 需要构造 React 元素的命令。与 builtins 分开，是为了守住 src/commands 的纯 TS 边界。 */
export const uiCommands: Process[] = [about, projects, skills, contact, resume, open]
```

在 `src/ui/useTerminal.ts` 中把注册改为：

```ts
      commands: [...builtins, ...uiCommands],
```

- [ ] **Step 9: 补样式**

追加到 `src/styles/terminal.css`：

```css
.md-h1 { font-weight: 700; color: var(--blue); }
.md-h2 { font-weight: 700; color: var(--cyan); }
.md-h3 { font-weight: 600; }
.md-li { padding-left: 1ch; }
.md a, .project-meta a { color: var(--cyan); text-decoration: underline; }
.md a:hover, .project-meta a:hover { color: var(--yellow); }

.project-card { margin: 0.5em 0; }
.project-name { font-weight: 700; color: var(--green); }
.project-summary { opacity: 0.85; }
.project-meta { opacity: 0.75; }
.project-meta-item { margin-right: 2ch; }
.project-meta-label { color: var(--magenta); }

.skill-group-name { font-weight: 700; color: var(--blue); margin-top: 0.5em; }
.skill-row { display: flex; gap: 2ch; }
.skill-bar { color: var(--green); letter-spacing: 1px; }
.skill-bar-empty { opacity: 0.3; }
```

- [ ] **Step 10: 运行测试并手动验证**

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`
Expected: 全绿。lint 尤其重要 —— 若 `src/commands/**` 里混进了 React 运行时 import，边界规则会在这里报错。

`pnpm dev` 手动确认：`projects` 出现可点击卡片；`skills` 出现条形图；`projects | grep Rust` 能命中并输出纯文本。

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "feat: 富输出的站点命令"
```

---
### Task 21: 启动动画

**Files:**
- Create: `src/ui/BootSequence.tsx`
- Modify: `src/ui/Terminal.tsx`
- Modify: `src/styles/terminal.css`
- Test: `src/ui/BootSequence.test.tsx`

**Interfaces:**
- Consumes: `/etc/motd`（Task 6）
- Produces: `<BootSequence lines={string[]} onDone={() => void} />`

**三条硬性行为：** 任意按键立即跳过；同一会话内刷新不重播（`sessionStorage`）；`prefers-reduced-motion: reduce` 时直接跳过动画。

- [ ] **Step 1: 写失败的测试**

`src/ui/BootSequence.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { BootSequence, BOOT_STORAGE_KEY } from './BootSequence'

const LINES = ['first', 'second', 'third']

beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('BootSequence', () => {
  it('逐行显示', () => {
    render(<BootSequence lines={LINES} onDone={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(120) })
    expect(screen.queryByText('first')).toBeTruthy()
    expect(screen.queryByText('third')).toBeNull()
  })

  it('全部显示完后回调 onDone', () => {
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('任意按键立即跳过并显示全部内容', () => {
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    act(() => { fireEvent.keyDown(window, { key: 'a' }) })
    expect(screen.queryByText('third')).toBeTruthy()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('播放完成后写入 sessionStorage', () => {
    render(<BootSequence lines={LINES} onDone={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(sessionStorage.getItem(BOOT_STORAGE_KEY)).toBe('1')
  })

  it('已播放过时直接完成，不做动画', () => {
    sessionStorage.setItem(BOOT_STORAGE_KEY, '1')
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledOnce()
    expect(screen.queryByText('third')).toBeTruthy()
  })

  it('用户偏好减少动效时直接完成', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q, addEventListener() {}, removeEventListener() {},
    }))
    const onDone = vi.fn()
    render(<BootSequence lines={LINES} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/ui/BootSequence.test.tsx`
Expected: FAIL —— 找不到 `./BootSequence`。

- [ ] **Step 3: 实现**

`src/ui/BootSequence.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'

export const BOOT_STORAGE_KEY = 'terminal-booted'
const LINE_DELAY_MS = 90

function shouldSkip(): boolean {
  try {
    if (sessionStorage.getItem(BOOT_STORAGE_KEY) === '1') return true
  } catch { /* 隐私模式下读取可能抛异常，按未播放处理 */ }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function BootSequence({ lines, onDone }: { lines: string[]; onDone(): void }) {
  const [shown, setShown] = useState(() => (shouldSkip() ? lines.length : 0))
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setShown(lines.length)
    try { sessionStorage.setItem(BOOT_STORAGE_KEY, '1') } catch { /* 忽略 */ }
    onDone()
  }

  // 已跳过时立即完成
  useEffect(() => {
    if (shown >= lines.length) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 逐行推进
  useEffect(() => {
    if (doneRef.current || shown >= lines.length) return
    const t = setTimeout(() => setShown(n => n + 1), LINE_DELAY_MS)
    return () => clearTimeout(t)
  }, [shown, lines.length])

  // 全部显示完毕
  useEffect(() => {
    if (shown >= lines.length) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  // 任意按键跳过
  useEffect(() => {
    const onKey = () => finish()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="boot" aria-hidden="true">
      {lines.slice(0, shown).map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}
```

`aria-hidden="true"`：读屏用户不需要听装饰性的开机动画，他们有 Task 23 的静态简历。

- [ ] **Step 4: 接进 Terminal**

在 `src/ui/Terminal.tsx` 顶部把 React 的导入补成 `import { useEffect, useMemo, useRef, useState } from 'react'`，并加：

```tsx
const BANNER = [
  '  _                      _             _ ',
  ' | |_ ___ _ __ _ __ ___ (_)_ __   __ _| |',
  " | __/ _ \\ '__| '_ ` _ \\| | '_ \\ / _` | |",
  ' | ||  __/ |  | | | | | | | | | | (_| | |',
  '  \\__\\___|_|  |_| |_| |_|_|_| |_|\\__,_|_|',
  '',
]
```

在组件内：

```tsx
  const [booted, setBooted] = useState(false)
  const motd = useMemo(() => {
    try { return term.readMotd() } catch { return '' }
  }, [term])

  const bootLines = useMemo(
    () => [...BANNER, ...motd.split('\n')],
    [motd],
  )
```

渲染时把 `<BootSequence>` 放在 block 列表之前，并在未启动完成前隐藏输入行：

```tsx
      {!booted && <BootSequence lines={bootLines} onDone={() => setBooted(true)} />}
      {term.blocks.map(b => <OutputBlock key={b.id} block={b} />)}
      ...
      {booted && <PromptLine ... />}
```

`useTerminal` 需要多导出一个读取器，在其返回值中加：

```ts
    readMotd: useCallback(() => {
      try { return kernel.ctx.vfs.readFile('/etc/motd') } catch { return '' }
    }, [kernel]),
```

- [ ] **Step 5: 补样式**

```css
.boot { color: var(--green); white-space: pre; overflow-x: auto; }
```

- [ ] **Step 6: 运行测试并手动验证**

Run: `pnpm test src/ui/`
Expected: PASS。

`pnpm dev` 确认：首次进入逐行打出 banner 和欢迎语；按任意键立刻全出；刷新页面不再重播；新开标签页会重播。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 开机启动动画"
```

---

### Task 22: 移动端适配

**Files:**
- Create: `src/ui/MobileKeyBar.tsx`
- Create: `src/ui/useVisualViewport.ts`
- Modify: `src/ui/Terminal.tsx`
- Modify: `src/styles/terminal.css`
- Test: `src/ui/MobileKeyBar.test.tsx`

**Interfaces:**
- Produces:
  - `<MobileKeyBar onKey={(k: MobileKey) => void} />`，`MobileKey = 'tab' | 'ctrl-c' | 'up' | 'down' | '|' | '~' | '/' | '-'`
  - `useVisualViewport(): { bottomInset: number }`

**要解决的三件事：** 虚拟键盘遮挡输入行；`Tab`/`Ctrl+C`/方向键在手机键盘上根本打不出；长输出横向溢出。

- [ ] **Step 1: 写失败的测试**

`src/ui/MobileKeyBar.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileKeyBar } from './MobileKeyBar'

describe('MobileKeyBar', () => {
  it('渲染出手机键盘打不出的按键', () => {
    render(<MobileKeyBar onKey={vi.fn()} />)
    for (const label of ['Tab', '^C', '↑', '↓', '|', '~']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('点击时回调对应的键名', () => {
    const onKey = vi.fn()
    render(<MobileKeyBar onKey={onKey} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tab' }))
    expect(onKey).toHaveBeenCalledWith('tab')
  })

  it('用 onMouseDown 阻止默认行为，避免输入框失焦', () => {
    const onKey = vi.fn()
    render(<MobileKeyBar onKey={onKey} />)
    const btn = screen.getByRole('button', { name: '|' })
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    btn.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
  })
})
```

第三条是关键：按键条若让输入框失去焦点，移动端虚拟键盘会收起，用户每按一次快捷键都要重新点输入框。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/ui/MobileKeyBar.test.tsx`
Expected: FAIL —— 找不到 `./MobileKeyBar`。

- [ ] **Step 3: 实现**

`src/ui/MobileKeyBar.tsx`：

```tsx
export type MobileKey = 'tab' | 'ctrl-c' | 'up' | 'down' | '|' | '~' | '/' | '-'

const KEYS: { key: MobileKey; label: string }[] = [
  { key: 'tab', label: 'Tab' },
  { key: 'ctrl-c', label: '^C' },
  { key: 'up', label: '↑' },
  { key: 'down', label: '↓' },
  { key: '|', label: '|' },
  { key: '~', label: '~' },
  { key: '/', label: '/' },
  { key: '-', label: '-' },
]

export function MobileKeyBar({ onKey }: { onKey(k: MobileKey): void }) {
  return (
    <div className="mobile-keybar">
      {KEYS.map(k => (
        <button
          key={k.key}
          type="button"
          aria-label={k.label}
          // 必须在 mousedown 阶段阻止默认行为，否则输入框失焦、虚拟键盘收起
          onMouseDown={e => e.preventDefault()}
          onTouchStart={e => e.preventDefault()}
          onClick={() => onKey(k.key)}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}
```

`src/ui/useVisualViewport.ts`：

```ts
import { useEffect, useState } from 'react'

/**
 * 返回虚拟键盘占用的底部高度。
 * 移动端浏览器弹出键盘时不改变 window.innerHeight，只有 visualViewport 会变。
 */
export function useVisualViewport(): { bottomInset: number } {
  const [bottomInset, setBottomInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const inset = window.innerHeight - vv.height - vv.offsetTop
      setBottomInset(Math.max(0, Math.round(inset)))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return { bottomInset }
}
```

- [ ] **Step 4: 接进 Terminal**

在 `Terminal` 中导入 `MobileKeyBar`、`useVisualViewport` 与类型 `MobileKey`，然后：

```tsx
  const { bottomInset } = useVisualViewport()

  const handleMobileKey = (k: MobileKey) => {
    switch (k) {
      case 'tab': { const r = runComplete(input); setInput(r.line); setHint(r.hint); return }
      case 'ctrl-c': term.interrupt(); setInput(''); setHint([]); return
      case 'up': setInput(history.prev(input)); return
      case 'down': setInput(history.next()); return
      default: setInput(input + k)
    }
  }
```

根元素改为 `<div className="terminal" style={{ paddingBottom: bottomInset }}>`，并在 `PromptLine` 之后渲染 `<MobileKeyBar onKey={handleMobileKey} />`。

- [ ] **Step 5: 补样式**

```css
/* 按键条只在没有 hover 能力的设备（触摸屏）上出现 */
.mobile-keybar { display: none; }

@media (hover: none) {
  .mobile-keybar {
    display: flex;
    gap: 0.4rem;
    position: sticky;
    bottom: 0;
    padding: 0.5rem 0;
    overflow-x: auto;
    background: var(--bg);
  }
  .mobile-keybar button {
    flex: 0 0 auto;
    min-width: 3rem;
    min-height: 2.5rem;       /* 触摸目标不小于 44px 的一半，配合 padding 达标 */
    padding: 0.4rem 0.6rem;
    font: inherit;
    color: var(--fg);
    background: var(--selection);
    border: 1px solid var(--selection);
    border-radius: 4px;
  }
  .terminal { font-size: 13px; }
}

/* 宽内容横向滚动，绝不让 body 出现横向滚动条 */
.block-output { overflow-x: auto; }
```

- [ ] **Step 6: 运行测试并在真机验证**

Run: `pnpm test src/ui/`
Expected: PASS。

用 `pnpm dev --host` 在手机浏览器打开，确认：点输入区弹出键盘且输入行没被遮住；按键条可用且按完键盘不收起；`tree` 的宽输出横向可滑动而整页不横滚。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 移动端适配与快捷键条"
```

---

### Task 23: SEO 与无障碍降级层

**Files:**
- Create: `src/seo/renderStaticResume.ts`
- Create: `src/seo/vite-plugin-static-resume.ts`
- Modify: `vite.config.ts`, `index.html`, `src/styles/global.css`, `src/ui/Terminal.tsx`
- Test: `src/seo/renderStaticResume.test.ts`

**Interfaces:**
- Consumes: 无（`renderStaticResume` 是纯函数，只吃 `Record<string, string>`）
- Produces:
  - `renderStaticResume(files: Record<string, string>, opts: { name: string; url?: string }): string`
  - `staticResumePlugin(): Plugin`

**这是 spec 里最容易做废的一节。** 静态简历**必须在构建时注入 `index.html`**，不能由 React 在运行时渲染 —— 否则不执行 JS 的爬虫和禁用 JS 的用户什么都拿不到，`<noscript>` 也无从填充。`renderStaticResume` 因此不含任何 React。

隐藏方式必须是 clip 裁剪的 visually-hidden，**不能是 `display: none`** —— 后者会被读屏软件跳过，等于没做无障碍。

- [ ] **Step 1: 写失败的测试**

`src/seo/renderStaticResume.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { renderStaticResume } from './renderStaticResume'

const FILES = {
  'about.md': '# 关于我\n\n一名工程师。\n',
  'contact.md': '# 联系方式\n\n- GitHub: https://github.com/example\n',
  'projects/alpha.md': '# alpha\n\n第一个项目。\n',
}

const html = () => renderStaticResume(FILES, { name: '张三', url: 'https://example.com' })

describe('renderStaticResume', () => {
  it('输出语义化标题', () => {
    expect(html()).toContain('<h1>')
    expect(html()).toContain('关于我')
  })

  it('包含项目内容', () => {
    expect(html()).toContain('alpha')
    expect(html()).toContain('第一个项目')
  })

  it('把裸 URL 变成可跟随的链接', () => {
    expect(html()).toContain('href="https://github.com/example"')
  })

  it('内嵌 JSON-LD 的 Person 结构化数据', () => {
    const out = html()
    expect(out).toContain('application/ld+json')
    expect(out).toContain('"@type": "Person"')
    expect(out).toContain('张三')
  })

  it('转义 HTML 特殊字符，防止内容注入标记', () => {
    const out = renderStaticResume({ 'about.md': '# <script>alert(1)</script>\n' }, { name: 'x' })
    expect(out).not.toContain('<script>alert(1)</script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('缺少某个文件时不抛异常', () => {
    expect(() => renderStaticResume({}, { name: 'x' })).not.toThrow()
  })

  it('不含任何 React 产物', () => {
    expect(html()).not.toContain('data-reactroot')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/seo/`
Expected: FAIL —— 找不到 `./renderStaticResume`。

- [ ] **Step 3: 实现渲染器**

`src/seo/renderStaticResume.ts`：

```ts
const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ESCAPES[ch]!)
}

const URL_RE = /(https?:\/\/[^\s<]+)/g

/** 先转义再链接化 —— 顺序反了就等于开了一个注入口子。 */
function linkify(escaped: string): string {
  return escaped.replace(URL_RE, url => `<a href="${url}">${url}</a>`)
}

/** 极简 Markdown → HTML。只处理标题、无序列表、段落。 */
function mdToHtml(source: string): string {
  const out: string[] = []
  let inList = false

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd()
    if (line.startsWith('### ')) { closeList(); out.push(`<h3>${linkify(escapeHtml(line.slice(4)))}</h3>`); continue }
    if (line.startsWith('## ')) { closeList(); out.push(`<h2>${linkify(escapeHtml(line.slice(3)))}</h2>`); continue }
    if (line.startsWith('# ')) { closeList(); out.push(`<h1>${linkify(escapeHtml(line.slice(2)))}</h1>`); continue }
    if (/^[-*] /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${linkify(escapeHtml(line.slice(2)))}</li>`)
      continue
    }
    closeList()
    if (line.trim() !== '') out.push(`<p>${linkify(escapeHtml(line))}</p>`)
  }
  closeList()
  return out.join('\n')
}

/**
 * 由内容文件生成一份完整的语义化简历 HTML。
 * 纯函数，无 React、无 DOM —— 它在构建时于 Node 中运行。
 */
export function renderStaticResume(
  files: Record<string, string>,
  opts: { name: string; url?: string },
): string {
  const sections: string[] = []

  if (files['about.md']) sections.push(mdToHtml(files['about.md']))

  const projectKeys = Object.keys(files)
    .filter(k => k.startsWith('projects/') && k.endsWith('.md'))
    .sort()
  if (projectKeys.length > 0) {
    sections.push('<h2>项目</h2>')
    for (const k of projectKeys) sections.push(mdToHtml(files[k]!))
  }

  if (files['contact.md']) sections.push(mdToHtml(files['contact.md']))

  const jsonLd = JSON.stringify(
    { '@context': 'https://schema.org', '@type': 'Person', name: opts.name, url: opts.url },
    null,
    2,
  )

  return [
    '<section id="static-resume">',
    sections.join('\n'),
    '</section>',
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join('\n')
}
```

- [ ] **Step 4: 实现 Vite 插件**

`src/seo/vite-plugin-static-resume.ts`：

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { renderStaticResume } from './renderStaticResume'

const CONTENT_DIR = 'src/content'

function collect(): Record<string, string> {
  const files: Record<string, string> = {}
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(join(dir, entry.name), `${prefix}${entry.name}/`); continue }
      if (!entry.name.endsWith('.md')) continue
      files[prefix + entry.name] = readFileSync(join(process.cwd(), dir, entry.name), 'utf8')
    }
  }
  walk(CONTENT_DIR, '')
  return files
}

/**
 * 构建时把静态简历注入 index.html。
 * 运行时渲染在这里是行不通的 —— 不执行 JS 的爬虫拿不到任何内容。
 */
export function staticResumePlugin(opts: { name: string; url?: string }): Plugin {
  return {
    name: 'static-resume',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const resume = renderStaticResume(collect(), opts)
        return html
          .replace('<!--STATIC_RESUME-->', resume)
          .replace('<!--NOSCRIPT_RESUME-->', `<noscript>${resume}</noscript>`)
      },
    },
  }
}
```

- [ ] **Step 5: 接线**

`vite.config.ts` 加入插件：

```ts
import { staticResumePlugin } from './src/seo/vite-plugin-static-resume'

export default defineConfig({
  plugins: [
    react(),
    staticResumePlugin({ name: 'cuixiaohan', url: 'https://github.com/cuixiaohan' }),
  ],
  base: process.env.VITE_BASE ?? '/',
})
```

`index.html` 的 `<body>` 改为：

```html
  <body>
    <a class="skip-link" href="#static-resume">跳到无障碍简历版本</a>
    <div id="root"></div>
    <!--STATIC_RESUME-->
    <!--NOSCRIPT_RESUME-->
    <script type="module" src="/src/main.tsx"></script>
  </body>
```

`src/styles/global.css` 加：

```css
/* clip 裁剪而非 display:none —— 后者会被读屏软件跳过，等于没做无障碍 */
#static-resume {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.skip-link {
  position: absolute;
  left: -9999px;
  background: var(--bg);
  color: var(--fg);
  padding: 0.5rem 1rem;
  z-index: 10;
}
.skip-link:focus { left: 0; top: 0; }
```

在 `src/ui/Terminal.tsx` 的输出区加上 `aria-live`，让选择留在终端的读屏用户也能听到命令结果：

```tsx
      <div aria-live="polite" aria-atomic="false">
        {term.blocks.map(b => <OutputBlock key={b.id} block={b} />)}
      </div>
```

- [ ] **Step 6: 验证注入真的发生了**

```bash
pnpm build
grep -c 'id="static-resume"' dist/index.html
grep -c 'application/ld+json' dist/index.html
grep -c '<noscript>' dist/index.html
```

Expected: 三条都输出 `1` 或更大。若为 0，说明 `transformIndexHtml` 没跑或占位注释被改动过 —— 这是本任务唯一重要的验收点。

再确认 React 挂载后没有把它清掉：

```bash
pnpm preview
# 浏览器打开后在控制台执行：document.querySelector('#static-resume').textContent.length
```

Expected: 大于 0。

- [ ] **Step 7: 运行全量测试并提交**

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`

```bash
git add -A
git commit -m "feat: SEO 与无障碍降级层"
```

---
### Task 24: 彩蛋命令

**Files:**
- Create: `src/commands/fun/sudo.ts`, `cowsay.ts`, `neofetch.ts`, `fortune.ts`, `exit.ts`
- Create: `src/ui/commands/matrix.tsx`
- Modify: `src/commands/fs/rm.ts`（`rm -rf /` 的特殊处理）
- Modify: `src/commands/fs/write.test.ts`（更新那条根目录测试的期望）
- Modify: `src/commands/index.ts`, `src/ui/commands/index.ts`
- Test: `src/commands/fun/fun.test.ts`

**Interfaces:**
- Consumes: `hidden?: boolean`（Task 15 加入的契约字段）
- Produces: `sudo`, `cowsay`, `neofetch`, `fortune`, `exit`, `matrix` —— 全部 `hidden: true`

**全部彩蛋命令必须设 `hidden: true`**，否则会出现在 `help` 里，发现的乐趣就没了。

**行为变更（需要同步改测试）：** Task 14 中「拒绝删除根目录」一测原本期望 `Operation not permitted`。本任务把 `rm -rf /` 改成彩蛋响应，退出码仍是 1，但输出变成玩笑文本。请把那条测试的断言改为检查输出包含 `nice try`，不要留着旧断言让测试红着。

- [ ] **Step 1: 写失败的测试**

`src/commands/fun/fun.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { sudo } from './sudo'
import { cowsay } from './cowsay'
import { neofetch } from './neofetch'
import { fortune } from './fortune'
import { exit } from './exit'
import { rm } from '../fs/rm'
import { makeTestCtx, runCmd } from '../testkit'
import type { Ctx, Process } from '../../core/process'

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

const ALL: Process[] = [sudo, cowsay, neofetch, fortune, exit]

describe('彩蛋通则', () => {
  it('全部标记为 hidden，不出现在 help 中', () => {
    for (const p of ALL) expect(p.hidden, `${p.name} 未标记 hidden`).toBe(true)
  })
})

describe('sudo', () => {
  it('给出经典的 sudoers 拒绝信息', async () => {
    const r = await runCmd(sudo, ['sudo', 'rm', '-rf', '/'], ctx)
    expect(r.err).toContain('is not in the sudoers file')
    expect(r.code).toBe(1)
  })
})

describe('cowsay', () => {
  it('把文字包进对话气泡里', async () => {
    const r = await runCmd(cowsay, ['cowsay', 'hello'], ctx)
    expect(r.out).toContain('hello')
    expect(r.out).toContain('^__^')
  })

  it('无参数时用默认台词', async () => {
    expect((await runCmd(cowsay, ['cowsay'], ctx)).out.length).toBeGreaterThan(0)
  })

  it('从 stdin 读取', async () => {
    expect((await runCmd(cowsay, ['cowsay'], ctx, 'piped')).out).toContain('piped')
  })
})

describe('neofetch', () => {
  it('输出系统信息与用户名', async () => {
    const r = await runCmd(neofetch, ['neofetch'], ctx)
    expect(r.out).toContain('guest@terminal')
    expect(r.out).toContain('Shell')
  })
})

describe('fortune', () => {
  it('输出一条非空格言', async () => {
    expect((await runCmd(fortune, ['fortune'], ctx)).out.trim().length).toBeGreaterThan(0)
  })
})

describe('exit', () => {
  it('提示无处可逃', async () => {
    const r = await runCmd(exit, ['exit'], ctx)
    expect(r.out.length).toBeGreaterThan(0)
    expect(r.code).toBe(0)
  })
})

describe('rm -rf /', () => {
  it('是彩蛋而不是真的删除', async () => {
    const r = await runCmd(rm, ['rm', '-rf', '/'], ctx)
    expect(r.code).toBe(1)
    expect(r.out + r.err).toContain('nice try')
    expect(ctx.vfs.isDir('/home/guest')).toBe(true)     // 文件树完好
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test src/commands/fun/`
Expected: FAIL —— 找不到模块。

- [ ] **Step 3: 实现**

`src/commands/fun/sudo.ts`：

```ts
import type { Process } from '../../core/process'

export const sudo: Process = {
  name: 'sudo',
  description: '以超级用户身份执行',
  usage: 'sudo 命令',
  hidden: true,

  async run(io, ctx) {
    const user = ctx.env.get('USER') ?? 'guest'
    io.stderr.writeLine(`[sudo] password for ${user}: `)
    io.stderr.writeLine(`${user} is not in the sudoers file. This incident will be reported.`)
    return 1
  },
}
```

`src/commands/fun/cowsay.ts`：

```ts
import { readAll } from '../lib'
import type { Process } from '../../core/process'

const COW = [
  '        \\   ^__^',
  '         \\  (oo)\\_______',
  '            (__)\\       )\\/\\',
  '                ||----w |',
  '                ||     ||',
]

export const cowsay: Process = {
  name: 'cowsay',
  description: '让牛替你说话',
  usage: 'cowsay [文字]',
  hidden: true,

  async run(io) {
    const fromArgs = io.argv.slice(1).join(' ')
    const text = (fromArgs || (await readAll(io.stdin)).trim() || '你好，欢迎来到我的终端。').trim()
    const bar = '-'.repeat(text.length + 2)

    io.stdout.writeLine(` ${bar}`)
    io.stdout.writeLine(`< ${text} >`)
    io.stdout.writeLine(` ${bar}`)
    for (const l of COW) io.stdout.writeLine(l)
    return 0
  },
}
```

`src/commands/fun/neofetch.ts`：

```ts
import type { Process, Style } from '../../core/process'

const LOGO = [
  '        .--.     ',
  '       |o_o |    ',
  '       |:_/ |    ',
  '      //   \\ \\   ',
  '     (|     | )  ',
  "    /'\\_   _/`\\  ",
  '    \\___)=(___/  ',
]

const ACCENT: Style = { color: 'cyan', bold: true }
const LABEL: Style = { color: 'blue', bold: true }

export const neofetch: Process = {
  name: 'neofetch',
  description: '显示系统信息',
  usage: 'neofetch',
  hidden: true,

  async run(io, ctx) {
    const user = ctx.env.get('USER') ?? 'guest'
    const host = ctx.env.get('HOSTNAME') ?? 'terminal'
    const info: [string, string][] = [
      [`${user}@${host}`, ''],
      ['OS', 'BrowserLinux x86_64 (WebAssembly ready)'],
      ['Kernel', '6.6.0-web'],
      ['Shell', ctx.env.get('SHELL') ?? '/bin/bash'],
      ['Terminal', 'terminal-site'],
      ['Theme', ctx.host.currentTheme()],
      ['Commands', String(ctx.registry.list().length)],
    ]

    const rows = Math.max(LOGO.length, info.length)
    for (let i = 0; i < rows; i++) {
      io.stdout.writeText((LOGO[i] ?? ' '.repeat(17)) + '  ', ACCENT)
      const entry = info[i]
      if (!entry) { io.stdout.writeText('\n'); continue }
      const [label, value] = entry
      if (value === '') io.stdout.writeLine(label, ACCENT)
      else { io.stdout.writeText(label + ': ', LABEL); io.stdout.writeLine(value) }
    }
    return 0
  },
}
```

`src/commands/fun/fortune.ts`：

```ts
import type { Process } from '../../core/process'

const QUOTES = [
  '过早的优化是万恶之源。 —— Donald Knuth',
  '计算机科学只有两件难事：缓存失效和命名。',
  '能跑就别动它。—— 但你还是动了，对吧？',
  '任何足够先进的技术都与魔法无异。 —— Arthur C. Clarke',
  '删代码比写代码更让人快乐。',
  '这个 bug 在我机器上复现不了。',
]

export const fortune: Process = {
  name: 'fortune',
  description: '随机格言',
  usage: 'fortune',
  hidden: true,

  async run(io) {
    io.stdout.writeLine(QUOTES[Math.floor(Math.random() * QUOTES.length)]!)
    return 0
  },
}
```

`src/commands/fun/exit.ts`：

```ts
import type { Process } from '../../core/process'

export const exit: Process = {
  name: 'exit',
  description: '退出终端',
  usage: 'exit',
  hidden: true,

  async run(io) {
    io.stdout.writeLine('这里没有出口。关掉标签页就行 —— 不过既然来了，试试 `help`？')
    return 0
  },
}
```

`src/ui/commands/matrix.tsx`：

```tsx
import { useEffect, useState } from 'react'
import { node, type Process } from '../../core/process'

const CHARS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789'
const COLS = 40
const ROWS = 12
const FRAME_MS = 90
const DURATION_MS = 6000

function randomGrid(): string[] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join(''),
  )
}

function MatrixRain() {
  const [grid, setGrid] = useState(randomGrid)

  useEffect(() => {
    const tick = setInterval(() => setGrid(randomGrid()), FRAME_MS)
    // 自动停下 —— 让它永远跑下去会一直占着 CPU
    const stop = setTimeout(() => clearInterval(tick), DURATION_MS)
    return () => { clearInterval(tick); clearTimeout(stop) }
  }, [])

  return (
    <div className="matrix" aria-hidden="true">
      {grid.map((row, i) => <div key={i}>{row}</div>)}
    </div>
  )
}

export const matrix: Process = {
  name: 'matrix',
  description: '数字雨',
  usage: 'matrix',
  hidden: true,

  async run(io) {
    io.stdout.write(node(<MatrixRain />, () => '[matrix rain]'))
    return 0
  },
}
```

样式追加到 `src/styles/terminal.css`：

```css
.matrix { color: var(--green); white-space: pre; overflow-x: auto; line-height: 1.1; }
```

- [ ] **Step 4: 改造 rm 的根目录处理**

在 `src/commands/fs/rm.ts` 的 `for (const t of operands)` 循环开头插入：

```ts
      // 彩蛋：rm -rf / 不真的删，也不冷冰冰地报 EPERM
      if (ctx.vfs.resolve(ctx.cwd, t) === '/' && flags.has('r') && flags.has('f')) {
        io.stdout.writeLine('rm: 正在删除 / ...')
        io.stdout.writeLine('rm: 正在删除 /home ...')
        io.stdout.writeLine('rm: 正在删除 /etc ...')
        io.stdout.writeLine('')
        io.stdout.writeLine('...开个玩笑。nice try —— 这里的文件系统只活在内存里。')
        return 1
      }
```

同时把 `src/commands/fs/write.test.ts` 中那条「拒绝删除根目录」的测试改为：

```ts
  it('rm -rf / 是彩蛋，不真的删除', async () => {
    const r = await runCmd(rm, ['rm', '-rf', '/'], ctx)
    expect(r.code).toBe(1)
    expect(r.out).toContain('nice try')
    expect(ctx.vfs.isDir('/home/guest')).toBe(true)
  })
```

不带 `-f` 的 `rm -r /` 仍走 VFS 的 `EPERM`，那条路径不受影响。

- [ ] **Step 5: 注册并运行全量测试**

把五个纯 TS 彩蛋加进 `src/commands/index.ts`，`matrix` 加进 `src/ui/commands/index.ts`。

Run: `pnpm test && pnpm exec tsc -b --noEmit && pnpm lint`
Expected: 全绿。特别确认 `help` 的输出里没有任何彩蛋命令。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 彩蛋命令"
```

---

### Task 25: 构建、部署与文档

**Files:**
- Create: `README.md`
- Create: `.github/workflows/deploy.yml`
- Test: 无新测试；本任务的验收是构建产物本身

`vite.config.ts` 不需要改动 —— `base` 在 Task 1 就已按 `VITE_BASE` 配好，Task 23 已注入插件。

**Interfaces:**
- Consumes: 全部前置任务
- Produces: 可部署的 `dist/`，以及一份让作者知道怎么改内容的 README

- [ ] **Step 1: 验证生产构建**

```bash
pnpm build
```

Expected: 构建成功。然后逐项确认产物：

```bash
test -f dist/index.html && echo "index ok"
grep -c 'id="static-resume"' dist/index.html      # 期望 >= 1
grep -c '关于我' dist/index.html                   # 期望 >= 1，内容真的被内联了
du -sh dist                                        # 记录体积
```

若 `grep '关于我'` 为 0，说明 Task 23 的构建时注入在生产模式下失效 —— 必须修好再继续，否则 SEO 层等于没做。

- [ ] **Step 2: 验证预览**

```bash
pnpm preview
```

在浏览器中确认：启动动画播放；`help`、`about`、`projects`、`skills` 正常；`theme nord` 生效；`cat about.md | grep 工程` 有输出。

- [ ] **Step 3: 写 README**

`README.md`：

```markdown
# terminal-site

一个纯静态的终端风格个人主页。访客通过输入 Linux 命令浏览内容。

## 快速开始

    pnpm install
    pnpm dev

## 命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 本地开发 |
| `pnpm build` | 生产构建，产物在 `dist/` |
| `pnpm preview` | 预览生产构建 |
| `pnpm test` | 运行测试 |
| `pnpm lint` | 代码检查 |

## 改内容

日常改简历**只需要动 `src/content/`**，不需要碰代码：

- `about.md` —— `about` 命令与静态简历的正文
- `contact.md` —— 联系方式
- `projects/*.md` —— 一个文件一个项目，新增文件即新增项目
- `skills.json` —— 技能分组，`level` 取值 1–5

改完直接 `pnpm build`，静态简历与虚拟文件系统都会自动同步。

## 架构

    src/core/       shell 内核。纯 TypeScript，零 React 依赖，可在 Node 中单测
    src/commands/   内置命令，纯 TypeScript
    src/ui/         React 渲染层
    src/ui/commands/  需要富输出（可点击卡片、图表）的命令
    src/content/    内容源
    src/seo/        构建时注入的静态简历

`src/core/` 与 `src/commands/` **不得运行时依赖 React**，这条边界由 ESLint 强制。
需要构造 React 元素的命令一律放在 `src/ui/commands/`。

## 加一个命令

实现 `Process` 契约即可：

```ts
import type { Process } from '../core/process'

export const hello: Process = {
  name: 'hello',
  description: '打个招呼',
  usage: 'hello [名字]',
  async run(io, ctx) {
    io.stdout.writeLine(`你好，${io.argv[1] ?? ctx.env.get('USER')}`)
    return 0
  },
}
```

然后加进 `src/commands/index.ts` 的 `builtins`。

命令通过 `io.stdin` / `io.stdout` 收发数据，因此天然支持管道与重定向。

## WASM 扩展

命令契约刻意设计成 WASM 模块可以直接实现的形状：`IO` 是流式的，
`Registry.register()` 可在运行时调用。接入一个 `.wasm` 模块时，
只需新增 `src/core/wasm/loader.ts` 把 WASI 的 stdin/stdout 桥接到 `IO` 上，
`src/core/` 下的其他文件都不需要改动。

## 部署

推送到 `main` 分支后由 GitHub Actions 自动部署到 GitHub Pages。
部署到子路径时用 `VITE_BASE` 指定，例如：

    VITE_BASE=/terminal-site/ pnpm build
```

- [ ] **Step 4: 写部署工作流**

`.github/workflows/deploy.yml`：

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
        env:
          # 部署到 user.github.io/<repo>/ 时需要子路径；根域名部署可删掉这一行
          VITE_BASE: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - id: deploy
        uses: actions/deploy-pages@v4
```

工作流在构建前跑 `lint` 与 `test`，因此架构边界与全部测试都是部署的前置条件。

- [ ] **Step 5: 用子路径构建验证一遍**

```bash
VITE_BASE=/terminal-site/ pnpm build
grep -o 'src="[^"]*"' dist/index.html | head
```

Expected: 资源路径带上 `/terminal-site/` 前缀。这一步能提前发现 GitHub Pages 部署后白屏的经典问题。

- [ ] **Step 6: 最终全量验收**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm exec tsc -b --noEmit
pnpm build
```

Expected: 五条全部通过。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "docs: README 与 GitHub Pages 部署工作流"
```

---

## 完成标志

全部 25 个任务完成后，下列每一条都应成立：

1. `pnpm test` 全绿；`pnpm lint` 与 `pnpm exec tsc -b --noEmit` 无错误。
2. `src/core/` 与 `src/commands/` 下没有任何 React 运行时导入 —— 由 ESLint 强制，Task 1 Step 8 验证过规则本身有效。
3. `cat about.md | grep -i rust | wc -l` 这类三段管道正确工作。
4. `projects` 输出可点击卡片，且 `projects | grep Rust` 仍能命中（富节点降级成立）。
5. `dist/index.html` 里能 grep 到简历正文 —— 不执行 JS 的爬虫也能读到。
6. 手机浏览器上可用：键盘不遮挡输入行，快捷键条可用且不导致失焦。
7. 未来接入 WASM 时，`src/core/` 下除新增 `wasm/` 目录外无需修改任何文件。
