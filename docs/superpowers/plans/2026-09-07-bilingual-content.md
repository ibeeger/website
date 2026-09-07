# 中英双语内容实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 站点内容与命令描述支持中英双语，默认英文，新增 `lang` 命令切换。

**Architecture:** 语言是内容层的参数而非内核概念——`loadContent(lang)` 决定 VFS 里有什么，命令只管读文件，46 个命令实现文件一行不改。`lang` 命令走「命令 → Host → React 状态 → localStorage」这条链，与既有的 `theme` 完全同构。

**Tech Stack:** TypeScript 5.9、React 19、Vite 8、Vitest 4（`environment: 'node'`，用 DOM 的测试文件首行 `// @vitest-environment jsdom`）、pnpm。

**Spec:** `docs/superpowers/specs/2026-09-07-bilingual-content-design.md`

## Global Constraints

- `src/core/` 与 `src/commands/` **禁止运行时依赖 React**，由 ESLint 强制。需要 React 的代码放 `src/ui/`。
- **不得引入新的 npm 依赖。** 缺什么就停下来问，不要自行安装。所有 DOM 测试用 `@testing-library/react` 自带的 `fireEvent`，不用 `user-event`（不在依赖表里）。
- **唯一允许接触 `globalThis.LanguageModel` 的文件是 `src/core/ai/languageModel.ts`。**
- **现有 524 条用例不得回归。**
- TDD：先写失败测试、跑到确认失败、再写最小实现。
- 每个任务结束时 `pnpm lint`、`pnpm test`、`pnpm exec tsc -b`、`pnpm build` 四者全绿。
- 不得使用 `any`。
- 注释解释「为什么」不解释「是什么」，**且不得描述不存在的行为**。
- 彩蛋文案（`sudo`/`fortune`/`cowsay`/`exit`/`neofetch`）**保持中文，不翻译**。
- VFS 错误消息（`src/core/errors.ts`）本来就是英文，两种语言下都保持，不进翻译表。
- 默认语言 `en`。**不做浏览器语言嗅探。**

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/i18n/lang.ts` | `Lang` 类型、`LANGS`、`DEFAULT_LANG`、`LANG_STORAGE_KEY` |
| `src/i18n/commands.ts` | `COMMAND_TEXT` 命令描述查找表 |
| `src/i18n/ui.ts` | `help` 提示行、`lang` 命令自身、`ask` 诊断文案的双语 |
| `src/content/en/**` | 英文简历内容 |
| `src/content/zh/**` | 中文简历内容（从现有位置移过来） |
| `src/content/system.ts` | motd 分语言；passwd 与 /proc/version 语言无关 |
| `src/content/index.ts` | `loadContent(lang)` |
| `src/ui/useLang.ts` | 语言状态 + localStorage + `<html lang>` |
| `src/commands/sys/lang.ts` | `lang` 命令 |
| `src/core/testing/noopHost.ts` | 收敛三处重复的 noop host |
| `README.en.md` | 英文 README |

---

### Task 1: 收敛 noop host 并给 Host 加语言方法

Spec 把这条写成硬性要求：`Host` 已经有五个方法，而 noop 实现有四份复制品（三处 core 测试 + `testkit.ts`）。**先收敛再扩张**，否则加完就是七份复制品。

**Files:**
- Create: `src/core/testing/noopHost.ts`
- Modify: `src/core/process.ts`（`Host` 接口）
- Modify: `src/core/kernel.test.ts:6-9`、`src/core/shell/executor.test.ts:11-14`、`src/core/shell/expand.test.ts:11-14`
- Modify: `src/commands/testkit.ts`（`testHost`）
- Modify: `src/ui/host.ts`（`UiHooks` 与 `createUiHost`）
- Modify: `src/ui/useTerminal.ts`（`hooksBox` 两处补占位）
- Test: `src/core/testing/noopHost.test.ts`

**Interfaces:**
- Produces: `Lang`（从 Task 2 的 `src/i18n/lang.ts` 导入——本任务先用字面量类型 `'en' | 'zh'`，Task 2 建好类型后由 Task 2 改为 import）；`Host.setLang(lang)` / `Host.currentLang()`；`makeNoopHost(overrides?)`

**注意顺序问题：** 本任务需要 `Lang` 类型，但它在 Task 2 才建。为避免循环依赖，**本任务在 `src/core/process.ts` 里就地定义 `Lang`**：

```ts
export type Lang = 'en' | 'zh'
```

Task 2 的 `src/i18n/lang.ts` 从 `core/process` re-export 它，而不是反过来——`src/core/` 不该依赖 `src/i18n/`。

- [ ] **Step 1: 写失败测试**

Create `src/core/testing/noopHost.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { makeNoopHost } from './noopHost'

describe('makeNoopHost', () => {
  it('所有方法都可调用且不抛异常 —— 它的全部职责就是「什么都不做」', () => {
    const h = makeNoopHost()
    expect(() => { h.clear(); h.setTheme('x'); h.enterChat({ systemPrompt: 's' }); h.setLang('zh') }).not.toThrow()
  })

  it('默认返回 en —— 与站点默认语言一致，测试里不必每次显式指定', () => {
    expect(makeNoopHost().currentLang()).toBe('en')
  })

  it('可以按需覆盖单个方法 —— 三处 core 测试对 listThemes 的期望各不相同', () => {
    const h = makeNoopHost({ listThemes: () => ['dracula'] })
    expect(h.listThemes()).toEqual(['dracula'])
    expect(h.currentTheme()).toBe('dracula')   // 未覆盖的部分保持默认
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/core/testing/noopHost.test.ts`
Expected: FAIL — `Failed to resolve import "./noopHost"`。

- [ ] **Step 3: 加 Lang 类型与 Host 方法**

`src/core/process.ts`，在 `Host` 接口之前加类型：

```ts
/** 界面语言。定义在 core 而不是 i18n，因为 Host 契约要用它，
 * 而 src/core/ 不该反向依赖 src/i18n/。 */
export type Lang = 'en' | 'zh'
```

`Host` 接口末尾加两个方法：

```ts
export interface Host {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
  /** 请求 UI 进入对话模式。命令调用后立即返回，不等待模式结束。 */
  enterChat(opts: { systemPrompt: string }): void
  /** 切换界面语言。UI 会据此重建 VFS —— 内容是按语言加载的。 */
  setLang(lang: Lang): void
  currentLang(): Lang
}
```

- [ ] **Step 4: 建共享 fixture**

Create `src/core/testing/noopHost.ts`：

```ts
import type { Host } from '../process'

/**
 * 什么都不做的 Host。三处 core 测试原本各自维护一份字面量，
 * Host 每加一个方法就要改三处 —— 收敛到这里，加方法只改一处。
 * overrides 是必要的：三处测试对 listThemes 的期望各不相同。
 */
export function makeNoopHost(overrides: Partial<Host> = {}): Host {
  return {
    clear() {},
    setTheme() {},
    listThemes() { return ['dracula'] },
    currentTheme() { return 'dracula' },
    enterChat() {},
    setLang() {},
    currentLang() { return 'en' },
    ...overrides,
  }
}
```

- [ ] **Step 5: 替换三处复制品**

`src/core/kernel.test.ts:6-9`、`src/core/shell/executor.test.ts:11-14`、`src/core/shell/expand.test.ts:11-14` 各自删掉 `const noopHost: Host = {...}` 字面量，改为：

```ts
import { makeNoopHost } from '../testing/noopHost'   // executor/expand 用 '../testing/noopHost'
// kernel.test.ts 用 './testing/noopHost'
const noopHost = makeNoopHost({ listThemes: () => ['dracula'] })   // kernel.test.ts 原本返回 ['dracula']
```

`executor.test.ts` 与 `expand.test.ts` 原本 `listThemes` 返回 `[]`、`currentTheme` 返回 `'x'`：

```ts
const noopHost = makeNoopHost({ listThemes: () => [], currentTheme: () => 'x' })
```

保持各自原有的返回值，不要统一——那会改变既有用例的前提。

- [ ] **Step 6: 补齐其余 Host 实现**

`src/commands/testkit.ts` 的 `testHost` 加两个方法（它有自己的 `listThemes` 期望，不改）：

```ts
export const testHost: Host = {
  clear() {},
  setTheme() {},
  listThemes() { return ['dracula', 'nord'] },
  currentTheme() { return 'dracula' },
  enterChat() {},
  setLang() {},
  currentLang() { return 'en' },
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
  setLang(lang: Lang): void
  currentLang(): Lang
}

export function createUiHost(box: { current: UiHooks }): Host {
  return {
    clear() { box.current.clear() },
    setTheme(name) { box.current.setTheme(name) },
    listThemes() { return box.current.listThemes() },
    currentTheme() { return box.current.currentTheme() },
    enterChat(opts) { box.current.enterChat(opts) },
    setLang(lang) { box.current.setLang(lang) },
    currentLang() { return box.current.currentLang() },
  }
}
```

顶部加 `import type { Host, Lang } from '../core/process'`。

`src/ui/useTerminal.ts` 的 `hooksBox` 两处（惰性初始值与每次渲染的赋值）补占位，Task 3 接真的：

```ts
// 惰性初始值里
setLang() { /* Task 3 接入 */ },
currentLang() { return 'en' as const },
// 每次渲染的赋值里
setLang: () => { /* Task 3 接入 */ },
currentLang: () => 'en' as const,
```

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm vitest run src/core && pnpm exec tsc -b && pnpm lint`
Expected: 全部 PASS。

- [ ] **Step 8: 全量回归**

Run: `pnpm test`
Expected: 全绿，527 条（524 + 3 条新用例）。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "refactor: 收敛 noop host 的四份复制品，Host 加语言方法

Host 已有五个方法而 noop 实现有四份复制品，先收敛再扩张 ——
否则加完语言方法就是七份。Lang 定义在 core/process 而非 i18n：
Host 契约要用它，而 src/core/ 不该反向依赖 src/i18n/。"
```

---

### Task 2: 内容分语言与 loadContent(lang)

**已核实的前提，不用再查：** 开机动画由 `src/ui/Terminal.tsx:12` 的 `BANNER`（纯 ASCII 艺术字，语言无关）加 `/etc/motd` 拼成。所以 motd 分语言之后，开机动画自动跟着走，`Terminal.tsx` 不用改。


**Files:**
- Create: `src/i18n/lang.ts`
- Create: `src/content/en/about.md`、`src/content/en/contact.md`、`src/content/en/skills.json`、`src/content/en/projects/terminal-site.md`
- Move: 现有 `src/content/about.md` → `src/content/zh/about.md`；`contact.md`、`skills.json`、`projects/terminal-site.md` 同理
- Modify: `src/content/system.ts`（motd 分语言）
- Modify: `src/content/index.ts`（`loadContent(lang)`）
- Modify: `src/content/index.test.ts`
- Modify: `src/ui/useTerminal.ts`（`loadContent` 调用点）
- Modify: `vite.config.ts`（静态简历插件读英文内容）
- Modify: `src/seo/vite-plugin-static-resume.ts`（`CONTENT_DIR` 与 `collectSkills` 路径）

**Interfaces:**
- Consumes: `Lang`（Task 1，`src/core/process.ts`）
- Produces: `loadContent(lang: Lang): Record<string, string>`；`DEFAULT_LANG`、`LANGS`、`LANG_STORAGE_KEY`（`src/i18n/lang.ts`）

**英文内容不是逐字翻译。** 中文原文里有些表达直译会很别扭（比如「把复杂的东西做成简单的界面」）。写地道的英文技术简历措辞，但**事实必须完全一致**——不要在英文版里加中文版没有的经历、项目或数字。

- [ ] **Step 1: 写失败测试**

改写 `src/content/index.test.ts`，追加：

```ts
import { loadContent } from './index'

describe('loadContent(lang)', () => {
  it('英文与中文各自返回完整的文件树', () => {
    for (const lang of ['en', 'zh'] as const) {
      const files = loadContent(lang)
      expect(files['/home/guest/about.md']).toBeTruthy()
      expect(files['/home/guest/contact.md']).toBeTruthy()
      expect(files['/home/guest/skills.json']).toBeTruthy()
      expect(files['/home/guest/projects/terminal-site.md']).toBeTruthy()
    }
  })

  it('两种语言的正文确实不同 —— 不是同一份内容换了个壳', () => {
    expect(loadContent('en')['/home/guest/about.md'])
      .not.toBe(loadContent('zh')['/home/guest/about.md'])
  })

  it('语言目录名不出现在 VFS 路径里 —— ls 应当看到 about.md 而不是 en/about.md', () => {
    const paths = Object.keys(loadContent('en'))
    expect(paths.some(p => p.includes('/en/') || p.includes('/zh/'))).toBe(false)
  })

  it('motd 跟着语言走', () => {
    expect(loadContent('en')['/etc/motd']).not.toBe(loadContent('zh')['/etc/motd'])
  })

  it('语言无关的系统文件两种语言下一致', () => {
    expect(loadContent('en')['/etc/passwd']).toBe(loadContent('zh')['/etc/passwd'])
    expect(loadContent('en')['/proc/version']).toBe(loadContent('zh')['/proc/version'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/content/index.test.ts`
Expected: FAIL — `loadContent` 不接受参数（TS 报错）或返回值不含语言差异。

- [ ] **Step 3: 建 i18n/lang.ts**

Create `src/i18n/lang.ts`：

```ts
import type { Lang } from '../core/process'

// Lang 本身定义在 core/process：Host 契约要用它，而 src/core/ 不该反向依赖 src/i18n/。
// 这里 re-export，让 UI 与命令层有一个语言相关常量的统一入口。
export type { Lang }

export const LANGS: readonly Lang[] = ['en', 'zh']
export const DEFAULT_LANG: Lang = 'en'
export const LANG_STORAGE_KEY = 'terminal-lang'
```

- [ ] **Step 4: 移动中文内容并写英文内容**

```bash
mkdir -p src/content/zh/projects src/content/en/projects
git mv src/content/about.md src/content/zh/about.md
git mv src/content/contact.md src/content/zh/contact.md
git mv src/content/skills.json src/content/zh/skills.json
git mv src/content/projects/terminal-site.md src/content/zh/projects/terminal-site.md
rmdir src/content/projects
```

`src/content/en/about.md` —— 与中文版事实一致，措辞地道：

```markdown
# About

Full-stack engineer focused on front-end architecture and developer tools.

I care less about shipping features than about why a thing has the shape it does.
The terminal you're using is an example: no terminal emulator library, no shell
library. Lexing, parsing, expansion, globbing, pipes, and the virtual filesystem
are all hand-written TypeScript. React only paints characters on screen — a
boundary ESLint enforces, so a React import under `src/core/` fails the build.

How I work:

- **Tests first.** Roughly 3,500 lines of implementation against 45 test files
  and 524 cases. The kernel runs under Node with no browser involved.
- **Comments explain why, not what.** The code already says what it does.
  Why it's written this way, and why not the other way, only a comment can carry.
- **Accessibility isn't a patch.** With JavaScript disabled this terminal falls
  back to a semantic résumé a screen reader can read end to end. Hiding uses clip,
  not `display: none` — the latter gets skipped by screen readers entirely.

- Focus: TypeScript / React / Rust / WebAssembly
- Based in: China
- Status: open to opportunities

Type `projects` to see what I've built, `skills` for what I know,
`contact` to reach me.

If you're on Chrome with the built-in model enabled, type `ask` to talk to me —
that model runs entirely on your own machine and nothing leaves it.
```

`src/content/en/contact.md`：

```markdown
# Contact

- Email: mr.web0310@gmail.com
- Site: https://i.xiaohan.dev

I usually reply within 24 hours.
```

`src/content/en/projects/terminal-site.md`：

```markdown
# terminal-site

The site you're looking at. A static terminal emulator with no off-the-shelf
terminal library — the whole command path is hand-written.

- **Shell front end**: lexer → parser → expansion → glob → executor.
  Pipes `|`, redirection `>` `>>`, environment variables `$VAR`, exit codes `$?`,
  tab completion, history.
- **Virtual filesystem**: an in-memory tree with path resolution, directory
  traversal, and the same error codes a real system returns
  (ENOENT / EISDIR / EPERM).
- **Process contract**: every command implements one `Process` interface and
  talks through a streaming `IO`. Any command composes into a pipeline for free —
  including ones added later.
- **Zero-framework kernel**: React imports are banned under `src/core/`, enforced
  by ESLint. The kernel unit-tests under Node, and the same boundary leaves room
  to mount WASM command modules later.

One thing worth calling out on the SEO side: crawlers don't run JavaScript, so a
build-time Vite plugin renders the Markdown content into semantic HTML and injects
it into `index.html` — clipped from sighted users, fully visible to crawlers and
screen readers, and restored to normal layout when JavaScript is off.

- Stack: TypeScript, React, Vite, Vitest
- Size: ~3,500 lines of implementation, 45 test files / 524 cases
- Status: actively maintained
```

`src/content/en/skills.json` —— 与中文版结构完全一致，只译分组名：

```json
{
  "groups": [
    {
      "name": "Languages",
      "items": [
        { "name": "TypeScript", "level": 5 },
        { "name": "JavaScript", "level": 5 },
        { "name": "Rust", "level": 3 },
        { "name": "Go", "level": 3 }
      ]
    },
    {
      "name": "Front end",
      "items": [
        { "name": "React", "level": 5 },
        { "name": "Vite", "level": 4 },
        { "name": "CSS", "level": 4 },
        { "name": "WebAssembly", "level": 3 }
      ]
    },
    {
      "name": "Engineering",
      "items": [
        { "name": "Node.js", "level": 4 },
        { "name": "Vitest", "level": 4 },
        { "name": "ESLint", "level": 4 },
        { "name": "Git", "level": 4 },
        { "name": "CI/CD", "level": 3 },
        { "name": "GitHub Actions", "level": 3 }
      ]
    },
    {
      "name": "Other",
      "items": [
        { "name": "Accessibility", "level": 3 },
        { "name": "SEO", "level": 3 }
      ]
    }
  ]
}
```

同时把 `src/content/zh/about.md` 里那句 ask 引导改成对话模式的说法（现有中文版已经提到 `ask`，措辞与英文版对齐即可）。

- [ ] **Step 5: system.ts 的 motd 分语言**

`src/content/system.ts` 改为：

```ts
import type { Lang } from '../core/process'

const MOTD: Record<Lang, string> = {
  en: [
    'Welcome to terminal-site.',
    '',
    "Type 'help' to see available commands.",
    "Type 'about' if you'd rather just read.",
    '',
  ].join('\n'),
  zh: [
    'Welcome to terminal-site.',
    '',
    "输入 'help' 查看可用命令。",
    "输入 'about' 直接读文字版。",
    '',
  ].join('\n'),
}

/** 与语言无关的系统文件：它们模拟的是真实系统，本来就不该本地化。 */
const LANG_NEUTRAL: Record<string, string> = {
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

export function systemFiles(lang: Lang): Record<string, string> {
  return { ...LANG_NEUTRAL, '/etc/motd': MOTD[lang] }
}
```

`.bashrc` 保持中文——它是彩蛋链的一环（指向 `neofetch`），按全局约束不翻译。

- [ ] **Step 6: loadContent(lang)**

`src/content/index.ts` 改为：

```ts
import { systemFiles } from './system'
import enSkills from './en/skills.json'
import zhSkills from './zh/skills.json'
import type { Lang } from '../core/process'

const HOME = '/home/guest'

/** Vite 构建时把 Markdown 内容内联为字符串。此文件是 core 与 Vite 之间的唯一接缝。 */
const markdown = import.meta.glob('./*/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const SKILLS: Record<Lang, unknown> = { en: enSkills, zh: zhSkills }

export function loadContent(lang: Lang): Record<string, string> {
  const files: Record<string, string> = { ...systemFiles(lang) }
  const prefix = `./${lang}/`
  for (const [rel, content] of Object.entries(markdown)) {
    if (!rel.startsWith(prefix)) continue
    // './en/projects/x.md' -> '/home/guest/projects/x.md'
    // 语言目录名不进 VFS 路径：访客该看到 about.md，而不是 en/about.md。
    files[HOME + '/' + rel.slice(prefix.length)] = content
  }
  files[`${HOME}/skills.json`] = JSON.stringify(SKILLS[lang], null, 2) + '\n'
  return files
}

export { enSkills, zhSkills }
```

**注意 `import.meta.glob` 的模式从 `'./**/*.md'` 改成了 `'./*/**/*.md'`** —— 前者会把 `en/` 与 `zh/` 都抓进来但无法区分层级，后者保证第一段一定是语言目录。

其它文件里 `import { skills } from '../content'` 的引用要跟着改。用 `grep -rn "from '.*content'" src/` 找出全部调用点。

- [ ] **Step 7: 更新调用点**

`src/ui/useTerminal.ts` 里 `buildInitialVfs(loadContent())` 改为 `buildInitialVfs(loadContent(lang))`——`lang` 由 Task 3 提供，本任务先硬编码 `DEFAULT_LANG`：

```ts
import { DEFAULT_LANG } from '../i18n/lang'
// ...
vfs: buildInitialVfs(loadContent(DEFAULT_LANG)),
```

`src/seo/vite-plugin-static-resume.ts` 的 `CONTENT_DIR` 从 `'src/content'` 改为 `'src/content/en'`（spec：静态简历只注入英文），`collectSkills()` 读 `src/content/en/skills.json`。

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm vitest run src/content && pnpm exec tsc -b && pnpm lint && pnpm build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 9: 全量回归**

Run: `pnpm test`
Expected: 全绿。若 `src/seo/*.test.ts` 因内容路径变化而失败，更新其 fixture 而非改生产代码。

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "feat: 内容分中英两套，loadContent 接受语言参数

语言目录名不进 VFS 路径 —— 访客该看到 about.md 而不是 en/about.md。
motd 跟着语言走，passwd 与 /proc/version 语言无关（它们模拟的是真实系统）。
.bashrc 保持中文：它是指向 neofetch 的彩蛋链一环。
静态简历改读 src/content/en，与默认语言一致。"
```

---

### Task 3: useLang 与 `<html lang>`

**Files:**
- Create: `src/ui/useLang.ts`
- Create: `src/ui/useLang.test.tsx`
- Modify: `src/ui/useTerminal.ts`

**Interfaces:**
- Consumes: `Lang`、`DEFAULT_LANG`、`LANG_STORAGE_KEY`、`LANGS`（Task 2）
- Produces: `useLang(): { lang: Lang; setLang(l: Lang): void; langs: readonly Lang[] }`

形状照搬 `src/ui/useTheme.ts`，包括隐私模式下 `localStorage` 抛异常时回落默认值的 try/catch。

- [ ] **Step 1: 写失败测试**

Create `src/ui/useLang.test.tsx`：

```tsx
// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLang } from './useLang'
import { LANG_STORAGE_KEY } from '../i18n/lang'

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('lang') })
afterEach(() => { vi.restoreAllMocks() })

describe('useLang', () => {
  it('默认英文 —— 不做浏览器语言嗅探，同一个 URL 对谁都一样', () => {
    const { result } = renderHook(() => useLang())
    expect(result.current.lang).toBe('en')
  })

  it('读取已保存的选择', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'zh')
    expect(renderHook(() => useLang()).result.current.lang).toBe('zh')
  })

  it('保存的值不合法时回落默认 —— localStorage 是用户可改的', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'klingon')
    expect(renderHook(() => useLang()).result.current.lang).toBe('en')
  })

  it('localStorage 抛异常时回落默认 —— 隐私模式下 getItem 会直接抛', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(renderHook(() => useLang()).result.current.lang).toBe('en')
  })

  it('setLang 写入 localStorage', () => {
    const { result } = renderHook(() => useLang())
    act(() => { result.current.setLang('zh') })
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('zh')
  })

  it('写入失败不影响切换 —— 存不下也不该让功能失效', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const { result } = renderHook(() => useLang())
    act(() => { result.current.setLang('zh') })
    expect(result.current.lang).toBe('zh')
  })

  it('同步 document.documentElement.lang —— 读屏软件据此切换发音', () => {
    const { result } = renderHook(() => useLang())
    expect(document.documentElement.lang).toBe('en')
    act(() => { result.current.setLang('zh') })
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('非法语言被忽略', () => {
    const { result } = renderHook(() => useLang())
    act(() => { (result.current.setLang as (l: string) => void)('klingon') })
    expect(result.current.lang).toBe('en')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/ui/useLang.test.tsx`
Expected: FAIL — `Failed to resolve import "./useLang"`。

- [ ] **Step 3: 实现**

Create `src/ui/useLang.ts`：

```ts
import { useCallback, useLayoutEffect, useState } from 'react'
import { DEFAULT_LANG, LANGS, LANG_STORAGE_KEY, type Lang } from '../i18n/lang'

/** BCP 47 标签，给 <html lang> 用。读屏软件据此选发音。 */
const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-CN' }

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v)
}

function readStored(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    return isLang(saved) ? saved : DEFAULT_LANG
  } catch {
    return DEFAULT_LANG        // 隐私模式下 localStorage 可能直接抛异常
  }
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(readStored)

  // 与 useTheme 同理用 useLayoutEffect：<html lang> 影响读屏发音，
  // 让它在首次绘制前就位，而不是绘制后再改。
  useLayoutEffect(() => {
    document.documentElement.lang = HTML_LANG[lang]
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    if (!isLang(next)) return
    setLangState(next)
    try { localStorage.setItem(LANG_STORAGE_KEY, next) } catch { /* 忽略写入失败 */ }
  }, [])

  return { lang, setLang, langs: LANGS }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/ui/useLang.test.tsx && pnpm exec tsc -b && pnpm lint`
Expected: 8 条 PASS。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: useLang —— 语言状态、持久化与 html lang

形状照搬 useTheme，含隐私模式下 localStorage 抛异常的兜底。
用 useLayoutEffect 让 <html lang> 在首次绘制前就位：读屏据它选发音。"
```

---

### Task 4: lang 命令与 VFS 重建

**Files:**
- Create: `src/commands/sys/lang.ts`
- Create: `src/commands/sys/lang.test.ts`
- Modify: `src/commands/index.ts`
- Modify: `src/ui/useTerminal.ts`
- Modify: `src/ui/useTerminal.test.tsx`

**Interfaces:**
- Consumes: `Host.setLang` / `Host.currentLang`（Task 1）、`useLang`（Task 3）、`loadContent(lang)`（Task 2）
- Produces: `lang` 命令；`useTerminal` 在语言变化时重建内核

命令形状照搬 `src/commands/sys/theme.ts`（无参列出可选项并标记当前值、非法值报错退出码 1）。

- [ ] **Step 1: 写失败测试**

Create `src/commands/sys/lang.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { lang } from './lang'
import { makeTestCtx, runCmd, testHost } from '../testkit'
import type { Ctx, Lang } from '../../core/process'

function ctxWithLang(current: Lang = 'en') {
  const calls: Lang[] = []
  const ctx: Ctx = {
    ...makeTestCtx(),
    host: { ...testHost, currentLang: () => current, setLang: (l: Lang) => { calls.push(l) } },
  }
  return { ctx, calls }
}

describe('lang', () => {
  it('无参数时列出可选语言并标记当前值', async () => {
    const { ctx } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang'], ctx)
    expect(r.code).toBe(0)
    expect(r.out).toContain('en')
    expect(r.out).toContain('zh')
    expect(r.out).toContain('*')      // 当前值有标记
  })

  it('切换到有效语言时调用 host.setLang，退出码 0', async () => {
    const { ctx, calls } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang', 'zh'], ctx)
    expect(r.code).toBe(0)
    expect(calls).toEqual(['zh'])
  })

  it('提示临时文件会丢失 —— 切换要重建 VFS，不说就是静默丢数据', async () => {
    const { ctx } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang', 'zh'], ctx)
    expect(r.out).toMatch(/临时|temporary/i)
  })

  it('非法语言报错、不调用 setLang、退出码 1', async () => {
    const { ctx, calls } = ctxWithLang('en')
    const r = await runCmd(lang, ['lang', 'klingon'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('klingon')
    expect(calls).toEqual([])
  })

  it('切换到当前已是的语言不报错', async () => {
    const { ctx } = ctxWithLang('en')
    expect((await runCmd(lang, ['lang', 'en'], ctx)).code).toBe(0)
  })

  it('Tab 补全给出语言前缀匹配', () => {
    const { ctx } = ctxWithLang('en')
    expect(lang.complete!(['lang', 'z'], ctx)).toEqual(['zh'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/commands/sys/lang.test.ts`
Expected: FAIL — `Failed to resolve import "./lang"`。

- [ ] **Step 3: 实现命令**

Create `src/commands/sys/lang.ts`：

```ts
import { LANGS, type Lang } from '../../i18n/lang'
import type { Process, Style } from '../../core/process'

const ACTIVE: Style = { color: 'green', bold: true }

const LABEL: Record<Lang, string> = { en: 'English', zh: '中文' }

function isLang(v: string): v is Lang {
  return (LANGS as readonly string[]).includes(v)
}

export const lang: Process = {
  name: 'lang',
  description: 'Show or switch interface language',
  usage: 'lang [en|zh]',
  complete(argv) {
    const frag = argv[argv.length - 1] ?? ''
    return LANGS.filter(l => l.startsWith(frag))
  },

  async run(io, ctx) {
    const wanted = io.argv[1]

    if (wanted === undefined) {
      const current = ctx.host.currentLang()
      for (const l of LANGS) {
        const isCurrent = l === current
        io.stdout.writeLine(`  ${isCurrent ? '*' : ' '} ${l}  ${LABEL[l]}`, isCurrent ? ACTIVE : undefined)
      }
      return 0
    }

    if (!isLang(wanted)) {
      io.stderr.writeLine(`lang: ${wanted}: unknown language. Available: ${LANGS.join(', ')}`)
      return 1
    }

    // 切换会重建 VFS —— 用户 touch 出来的文件会消失。不说就是静默丢数据。
    io.stdout.writeLine(`Language set to ${LABEL[wanted]}. Temporary files you created are cleared.`)
    ctx.host.setLang(wanted)
    return 0
  },
}
```

注册进 `src/commands/index.ts`：`import { lang } from './sys/lang'`，并加进 `builtins` 数组里 `theme` 之后。

- [ ] **Step 4: useTerminal 接线并在语言变化时重建**

`src/ui/useTerminal.ts`：

```ts
import { useLang } from './useLang'
// 在 hooksBox 之前。只解构用得到的两个 —— langs 这里没有消费方，
// 解构出来会触发 no-unused-vars。
const { lang, setLang } = useLang()
```

`hooksBox` 的两处占位换成真的：

```ts
setLang: (l: Lang) => setLang(l),
currentLang: () => lang,
```

内核构造改为依赖 `lang`。现有写法是 `useState` 惰性初始化只构造一次，语言变化时必须重建：

```ts
// 语言变了就重建内核与 VFS —— 内容是按语言加载的，换语言等于换一整棵文件树。
// 用 useMemo 而不是 useState 惰性初始化：后者只在首次渲染求值，永远看不到语言变化。
const kernel = useMemo<Kernel>(() => createKernel({
  vfs: buildInitialVfs(loadContent(lang)),
  host: createUiHost(hooksBox),
  commands: [...builtins, ...uiCommands],
  ai,
}), [lang, hooksBox, ai])
```

**重建会丢掉 shell 历史与 cwd**，这是可接受的——切语言本来就是「重新开始」的动作，且命令已明确提示临时文件会清空。

`prompt` 状态也要跟着刷新：内核换了，`kernel.prompt()` 的返回值可能变。加一个 effect：

```ts
useEffect(() => { setPrompt(kernel.prompt()) }, [kernel])
```

- [ ] **Step 5: 补 useTerminal 的集成测试**

在 `src/ui/useTerminal.test.tsx` 追加：

```tsx
it('切换语言后 VFS 内容真的变了 —— 不是只改了个标记位', async () => {
  const { result } = renderHook(() => useTerminal())
  act(() => { result.current.submit('cat about.md') })
  await waitFor(() => expect(result.current.blocks.length).toBe(1))
  const english = result.current.blocks[0]!.chunks.map(chunkToText).join('')

  act(() => { result.current.submit('lang zh') })
  await waitFor(() => expect(result.current.blocks.length).toBe(2))
  act(() => { result.current.submit('cat about.md') })
  await waitFor(() => expect(result.current.blocks.length).toBe(3))
  const chinese = result.current.blocks[2]!.chunks.map(chunkToText).join('')

  expect(chinese).not.toBe(english)
  expect(chinese.length).toBeGreaterThan(0)
})
```

顶部需要 `import { chunkToText } from '../core/process'`。

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run src/commands/sys/lang.test.ts src/ui/useTerminal.test.tsx && pnpm exec tsc -b && pnpm lint`
Expected: PASS。

- [ ] **Step 7: 全量回归**

Run: `pnpm test && pnpm build`
Expected: 全绿。特别确认 `neofetch` 的命令计数用例仍通过——新增了一个非 hidden 命令，该用例断言的是「计数与 help 列出的数量一致」而非固定数字，应当自动适应。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: lang 命令与语言切换时的 VFS 重建

内核改用 useMemo 依赖 lang：useState 惰性初始化只在首次渲染求值，
永远看不到语言变化。重建会丢 shell 历史与 cwd，命令里已明确提示。"
```

---

### Task 5: 命令描述查找表与 help/man 回落

**Files:**
- Create: `src/i18n/commands.ts`
- Modify: `src/commands/sys/help.ts`
- Modify: `src/commands/sys/man.ts`
- Modify: `src/commands/sys/sys.test.ts`

**Interfaces:**
- Consumes: `Lang`（Task 1）、`Host.currentLang()`（Task 1）
- Produces: `commandText(name, lang): { description?: string; usage?: string }`

**关键设计：查不到就回落到 `Process` 自带的字段。** 新增命令不写翻译也能工作，只是显示原文。

- [ ] **Step 1: 写失败测试**

在 `src/commands/sys/sys.test.ts` 追加：

```ts
import { commandText } from '../../i18n/commands'

describe('命令描述查找表', () => {
  it('查得到时返回该语言的文案', () => {
    expect(commandText('ls', 'en').description).toBeTruthy()
    expect(commandText('ls', 'zh').description).toBeTruthy()
    expect(commandText('ls', 'en').description).not.toBe(commandText('ls', 'zh').description)
  })

  it('查不到的命令返回空对象 —— 调用方据此回落到 Process 自带字段', () => {
    expect(commandText('no-such-command', 'en')).toEqual({})
  })
})

describe('help 按语言显示', () => {
  it('英文下显示英文描述', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register(ls)
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain(commandText('ls', 'en').description!)
  })

  it('中文下显示中文描述', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'zh' as const } }
    ctx.registry.register(ls)
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain(commandText('ls', 'zh').description!)
  })

  it('翻译表里没有的命令回落到 Process 自带的 description', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register({ name: 'zzz', description: '自带描述', async run() { return 0 } })
    const r = await runCmd(help, ['help'], ctx)
    expect(r.out).toContain('自带描述')
  })
})

describe('man 按语言显示', () => {
  it('英文下显示英文 usage', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register(ls)
    const r = await runCmd(man, ['man', 'ls'], ctx)
    expect(r.out).toContain(commandText('ls', 'en').usage!)
  })

  it('翻译表里没有 usage 时回落到 Process 自带的', async () => {
    const ctx = { ...makeTestCtx(), host: { ...testHost, currentLang: () => 'en' as const } }
    ctx.registry.register({ name: 'zzz', description: 'd', usage: 'zzz --自带', async run() { return 0 } })
    const r = await runCmd(man, ['man', 'zzz'], ctx)
    expect(r.out).toContain('zzz --自带')
  })
})
```

文件顶部按需补 `import { ls } from '../fs/ls'`、`import { help } from './help'`、`import { man } from './man'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/commands/sys/sys.test.ts`
Expected: FAIL — `Failed to resolve import "../../i18n/commands"`。

- [ ] **Step 3: 建查找表**

Create `src/i18n/commands.ts`。**表里只放非 hidden 的命令**——彩蛋按全局约束保持中文，不进表：

```ts
import type { Lang } from '../core/process'

type Text = { description?: string; usage?: string }

/**
 * 命令描述不放进 Process 契约：那会让每个命令都背上翻译职责，
 * 新增命令必须先想好两种语言才能落地。放外置表 + 回落，
 * 新命令不写翻译也能工作，只是显示原文。
 *
 * 彩蛋命令（sudo/cowsay/neofetch/fortune/exit）不进表：它们藏在 help 之外，
 * 中文本身就是彩蛋属性的一部分。
 */
const TABLE: Record<Lang, Record<string, Text>> = {
  en: {
    ls: { description: 'List directory contents', usage: 'ls [-la] [path]' },
    pwd: { description: 'Print working directory', usage: 'pwd' },
    cd: { description: 'Change directory', usage: 'cd [path]' },
    cat: { description: 'Print file contents', usage: 'cat [file...]' },
    head: { description: 'Print the first lines of a file', usage: 'head [-n count] [file...]' },
    tail: { description: 'Print the last lines of a file', usage: 'tail [-n count] [file...]' },
    wc: { description: 'Count lines, words and characters', usage: 'wc [-lwc] [file...]' },
    tree: { description: 'Print the directory tree', usage: 'tree [path]' },
    find: { description: 'Find files by name', usage: 'find [path] [-name pattern]' },
    touch: { description: 'Create an empty file', usage: 'touch file...' },
    mkdir: { description: 'Create a directory', usage: 'mkdir [-p] directory...' },
    rm: { description: 'Remove files or directories', usage: 'rm [-rf] path...' },
    echo: { description: 'Print text', usage: 'echo [text...]' },
    grep: { description: 'Search for a pattern', usage: 'grep pattern [file...]' },
    sort: { description: 'Sort lines', usage: 'sort [-r] [file...]' },
    uniq: { description: 'Collapse adjacent duplicate lines', usage: 'uniq [-c] [file...]' },
    help: { description: 'List available commands', usage: 'help' },
    man: { description: 'Show command usage', usage: 'man command' },
    whoami: { description: 'Print the current user', usage: 'whoami' },
    uname: { description: 'Print system information', usage: 'uname [-a]' },
    date: { description: 'Print the current date and time', usage: 'date' },
    env: { description: 'List environment variables', usage: 'env' },
    export: { description: 'Set an environment variable', usage: 'export NAME=value' },
    which: { description: 'Locate a command', usage: 'which command' },
    history: { description: 'Show command history', usage: 'history' },
    clear: { description: 'Clear the screen', usage: 'clear' },
    theme: { description: 'Show or switch the color theme', usage: 'theme [name]' },
    lang: { description: 'Show or switch interface language', usage: 'lang [en|zh]' },
    about: { description: 'About me', usage: 'about' },
    contact: { description: 'How to reach me', usage: 'contact' },
    projects: { description: 'Things I have built', usage: 'projects' },
    skills: { description: 'Tech stack', usage: 'skills' },
    resume: { description: 'One-page résumé', usage: 'resume' },
    open: { description: 'Open a link in a new tab', usage: 'open https://...' },
    ask: {
      description: 'Talk to me (browser-local model)',
      usage: 'ask [--status] [question...]\n  ask            enter chat mode; exit, Ctrl+D or Ctrl+C when idle to leave\n  ask <question> one-off question',
    },
  },
  zh: {
    ls: { description: '列出目录内容', usage: 'ls [-la] [路径]' },
    pwd: { description: '显示当前目录', usage: 'pwd' },
    cd: { description: '切换目录', usage: 'cd [路径]' },
    cat: { description: '打印文件内容', usage: 'cat [文件...]' },
    head: { description: '打印文件开头若干行', usage: 'head [-n 行数] [文件...]' },
    tail: { description: '打印文件末尾若干行', usage: 'tail [-n 行数] [文件...]' },
    wc: { description: '统计行数、词数与字符数', usage: 'wc [-lwc] [文件...]' },
    tree: { description: '打印目录树', usage: 'tree [路径]' },
    find: { description: '按名称查找文件', usage: 'find [路径] [-name 模式]' },
    touch: { description: '创建空文件', usage: 'touch 文件...' },
    mkdir: { description: '创建目录', usage: 'mkdir [-p] 目录...' },
    rm: { description: '删除文件或目录', usage: 'rm [-rf] 路径...' },
    echo: { description: '打印文本', usage: 'echo [文本...]' },
    grep: { description: '搜索匹配的行', usage: 'grep 模式 [文件...]' },
    sort: { description: '排序', usage: 'sort [-r] [文件...]' },
    uniq: { description: '折叠相邻的重复行', usage: 'uniq [-c] [文件...]' },
    help: { description: '列出可用命令', usage: 'help' },
    man: { description: '查看命令用法', usage: 'man 命令' },
    whoami: { description: '显示当前用户', usage: 'whoami' },
    uname: { description: '显示系统信息', usage: 'uname [-a]' },
    date: { description: '显示当前日期时间', usage: 'date' },
    env: { description: '列出环境变量', usage: 'env' },
    export: { description: '设置环境变量', usage: 'export 名称=值' },
    which: { description: '定位命令', usage: 'which 命令' },
    history: { description: '显示命令历史', usage: 'history' },
    clear: { description: '清屏', usage: 'clear' },
    theme: { description: '查看或切换配色主题', usage: 'theme [主题名]' },
    lang: { description: '查看或切换界面语言', usage: 'lang [en|zh]' },
    about: { description: '关于我', usage: 'about' },
    contact: { description: '联系方式', usage: 'contact' },
    projects: { description: '我做过的项目', usage: 'projects' },
    skills: { description: '技术栈', usage: 'skills' },
    resume: { description: '一页式简历', usage: 'resume' },
    open: { description: '在新标签页打开链接', usage: 'open https://...' },
    ask: {
      description: '和我聊聊（浏览器本地模型）',
      usage: 'ask [--status] [问题...]\n  ask            进入对话模式，exit、Ctrl+D 或空闲时 Ctrl+C 退出\n  ask <问题>      一次性问答',
    },
  },
}

/** 查不到返回空对象，调用方据此回落到 Process 自带字段。 */
export function commandText(name: string, lang: Lang): Text {
  return TABLE[lang][name] ?? {}
}
```

**上表已覆盖全部非 hidden 命令**，包括 `src/ui/commands/` 下的六个（`about`、`contact`、`projects`、`skills`、`resume`、`open`）与 `ask`。`matrix` 是 `hidden: true` 的彩蛋，不进表。Step 5 的覆盖测试会验证这一点——若将来有遗漏，那条测试会立刻报出缺失的命令名。

- [ ] **Step 4: help 与 man 查表**

`src/commands/sys/help.ts` 的 `run` 改为：

```ts
  async run(io, ctx) {
    const lang = ctx.host.currentLang()
    const cmds = ctx.registry.list().filter(p => !p.hidden)
    const width = Math.max(...cmds.map(c => c.name.length), 0)

    io.stdout.writeLine(lang === 'zh' ? '可用命令：' : 'Available commands:')
    io.stdout.writeText('\n')
    for (const c of cmds) {
      io.stdout.writeText('  ')
      io.stdout.writeText(c.name.padEnd(width), NAME_STYLE)
      // 查不到就用命令自带的描述 —— 新命令不写翻译也能工作
      io.stdout.writeLine('  ' + (commandText(c.name, lang).description ?? c.description))
    }
    io.stdout.writeText('\n')
    io.stdout.writeLine(
      lang === 'zh'
        ? '输入 `man <命令>` 查看用法，Tab 键补全，↑↓ 翻历史。'
        : 'Type `man <command>` for usage. Tab completes, ↑↓ walks history.',
      { dim: true },
    )
    return 0
  },
```

`src/commands/sys/man.ts` 的 `run` 里，把 `proc.description` 与 `proc.usage` 换成查表带回落：

```ts
    const lang = ctx.host.currentLang()
    const t = commandText(proc.name, lang)
    const description = t.description ?? proc.description
    const usage = t.usage ?? proc.usage ?? proc.name

    io.stdout.writeLine(lang === 'zh' ? '名称' : 'NAME', HEADING)
    io.stdout.writeLine(`    ${proc.name} —— ${description}`)
    io.stdout.writeText('\n')
    io.stdout.writeLine(lang === 'zh' ? '用法' : 'USAGE', HEADING)
    for (const line of usage.split('\n')) {
      io.stdout.writeLine(`    ${line}`)
    }
```

两个文件顶部加 `import { commandText } from '../../i18n/commands'`。

`man` 的用法错误消息也要分语言：

```ts
    if (name === undefined) {
      io.stderr.writeLine(ctx.host.currentLang() === 'zh' ? '用法: man 命令' : 'Usage: man command')
      return 2
    }
```

- [ ] **Step 5: 补一条「表已覆盖全部非 hidden 命令」的测试**

在 `src/commands/sys/sys.test.ts` 追加。这条测试就是 Step 3 里「补齐」的判据：

```ts
import { builtins } from '../index'
import { uiCommands } from '../../ui/commands'

it('翻译表覆盖了全部非 hidden 命令 —— 漏一个就会在 help 里露出另一种语言', () => {
  const visible = [...builtins, ...uiCommands].filter(p => !p.hidden).map(p => p.name)
  const missing = { en: [] as string[], zh: [] as string[] }
  for (const lang of ['en', 'zh'] as const) {
    for (const name of visible) {
      if (commandText(name, lang).description === undefined) missing[lang].push(name)
    }
  }
  expect(missing).toEqual({ en: [], zh: [] })
})
```

**这条测试会因为 `src/ui/commands` 引入 React 而不能放在纯 Node 环境的文件里。** 如果 `sys.test.ts` 因此报错，把这一条单独放到 `src/ui/commands/i18nCoverage.test.tsx`，首行加 `// @vitest-environment jsdom`。

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm vitest run src/commands src/ui && pnpm exec tsc -b && pnpm lint`
Expected: PASS。若覆盖测试报出缺失命令，把它们补进表再跑。

- [ ] **Step 7: 全量回归**

Run: `pnpm test && pnpm build`

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 命令描述双语查找表，help 与 man 查表并回落

表外置而非塞进 Process 契约：新增命令不写翻译也能工作，只是显示原文。
彩蛋不进表 —— 中文本身是彩蛋属性的一部分。
一条覆盖测试保证漏翻会立刻暴露，而不是等访客在 help 里看到混排。"
```

---

### Task 6: ask 的诊断文案与人设跟随语言

**Files:**
- Modify: `src/i18n/ui.ts`（新建，放 `ask` 的双语文案）
- Modify: `src/commands/ai/ask.ts`
- Modify: `src/commands/ai/ask.test.ts`

**Interfaces:**
- Consumes: `Lang`、`Host.currentLang()`
- Produces: `DIAGNOSIS_TEXT: Record<Lang, Record<'unsupported' | 'unavailable' | 'downloadable' | 'downloading', string[]>>`

`ask` 的四态诊断不是彩蛋——绝大多数访客的浏览器跑不了内置模型，落在 `unsupported`，看到的是一整段说明。英文默认站点上这块必须是英文。

- [ ] **Step 1: 写失败测试**

在 `src/commands/ai/ask.test.ts` 追加：

```ts
const langCtx = (l: 'en' | 'zh', status: AiStatus, chunks: string[] = []) => ({
  ...makeTestCtx(FILES),
  host: { ...testHost, currentLang: () => l },
  ai: fakeAi(status, chunks),
})

describe('ask 的文案跟随语言', () => {
  it('英文下 unsupported 文案是英文', async () => {
    const r = await runCmd(ask, ['ask', 'hi'], langCtx('en', { kind: 'unsupported' }))
    expect(r.err).toContain('chrome://flags')
    expect(r.err).toMatch(/[A-Za-z]{4,}/)
    expect(r.err).not.toMatch(/[一-龥]/)
  })

  it('中文下 unsupported 文案是中文', async () => {
    const r = await runCmd(ask, ['ask', 'hi'], langCtx('zh', { kind: 'unsupported' }))
    expect(r.err).toContain('chrome://flags')
    expect(r.err).toMatch(/[一-龥]/)
  })

  it('四种不可用状态在两种语言下都有文案', async () => {
    for (const l of ['en', 'zh'] as const) {
      for (const kind of ['unsupported', 'unavailable', 'downloading'] as const) {
        const r = await runCmd(ask, ['ask', 'hi'], langCtx(l, { kind }))
        expect(r.err.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('system prompt 要求模型用当前语言回答', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['ok'])
    const ctx = { ...makeTestCtx(FILES), host: { ...testHost, currentLang: () => 'en' as const }, ai }
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ai.systemPrompts[0]).toMatch(/English/i)
  })

  it('中文模式下 system prompt 要求用中文回答', async () => {
    const ai = fakeAi({ kind: 'ready' }, ['ok'])
    const ctx = { ...makeTestCtx(FILES), host: { ...testHost, currentLang: () => 'zh' as const }, ai }
    await runCmd(ask, ['ask', 'hi'], ctx)
    expect(ai.systemPrompts[0]).toMatch(/中文/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/commands/ai/ask.test.ts`
Expected: FAIL — 英文语境下仍输出中文文案。

- [ ] **Step 3: 把 DIAGNOSIS 搬进 i18n 并加英文**

Create `src/i18n/ui.ts`，把 `src/commands/ai/ask.ts` 里现有的 `DIAGNOSIS` 常量整体移过来，包成按语言分的两份。英文版按同样的信息结构写，**不要逐字直译**：

```ts
import type { Lang } from '../core/process'

type Kind = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading'

/**
 * 不可用时的文案是主路径而非兜底 —— 网页环境下 Prompt API 仍需 flag 或
 * Origin Trial，绝大多数访客落在 unsupported。四种状态各给各的说明，
 * 而不是笼统报一句「不支持」让人不知道下一步做什么。
 */
export const DIAGNOSIS_TEXT: Record<Lang, Record<Kind, string[]>> = {
  en: {
    unsupported: [
      "This browser has no built-in model.",
      '',
      'ask uses Chrome’s built-in Gemini Nano — the model runs on your own',
      'machine, nothing is sent to a server, and it works offline.',
      '',
      'To try it you need Chrome 138+ with this flag enabled:',
      '  chrome://flags/#prompt-api-for-gemini-nano',
      '',
      'If you can’t, nothing else here depends on it. Try `help`.',
    ],
    unavailable: [
      'This device can’t run the built-in model.',
      '',
      'The bar is roughly 22GB of free disk plus either 4GB of VRAM or 16GB of RAM.',
      'Chrome sets that, not me.',
    ],
    downloadable: [
      'The built-in model hasn’t been downloaded yet.',
      '',
      'Asking a question with `ask <question>` starts the download (about 2GB,',
      'once). After it finishes you can just ask.',
    ],
    downloading: [
      'The model is still downloading.',
      '',
      'Come back when it finishes. `ask --status` shows where it is.',
    ],
  },
  zh: {
    // 把 src/commands/ai/ask.ts 里现有 DIAGNOSIS 常量的四段中文原样剪切过来，
    // 一个字都不要改写 —— 那些文案已经过评审，重写只会引入无谓的差异。
    unsupported: [/* 原 DIAGNOSIS.unsupported 的数组内容 */],
    unavailable: [/* 原 DIAGNOSIS.unavailable */],
    downloadable: [/* 原 DIAGNOSIS.downloadable */],
    downloading: [/* 原 DIAGNOSIS.downloading */],
  },
}
```

**实现时把 `src/commands/ai/ask.ts` 里现有的 `DIAGNOSIS` 四段中文原样搬进 `zh`，不要重写**——那些文案已经过评审，改动会引入不必要的差异。

- [ ] **Step 4: ask.ts 查语言**

`src/commands/ai/ask.ts` 删掉本地的 `DIAGNOSIS` 常量，改为在 `run` 里：

```ts
    const lang = ctx.host.currentLang()
    const diagnosis = DIAGNOSIS_TEXT[lang]
```

三处 `DIAGNOSIS[status.kind]` 改为 `diagnosis[status.kind]`。顶部 `import { DIAGNOSIS_TEXT } from '../../i18n/ui'`。

`buildSystemPrompt(ctx)` 加语言要求。函数签名改为 `buildSystemPrompt(ctx: Ctx, lang: Lang)`，在返回的数组里加一行：

```ts
    lang === 'zh' ? '用中文回答。' : 'Answer in English.',
```

其余提示语（「你是这个个人主页的主人本人」等）也要跟着语言走——英文版：

```ts
    'You are the owner of this personal site, answering a visitor in your own terminal.',
    'Use first person. Keep it plain and direct, the way engineers talk. Answer briefly.',
    '',
    'Answer only from the material below. If it is not there, say you do not know.',
    'Do not invent jobs, companies, dates, or numbers — making things up is worse',
    'than admitting you do not know.',
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm vitest run src/commands/ai && pnpm exec tsc -b && pnpm lint`

- [ ] **Step 6: 全量回归**

Run: `pnpm test && pnpm build`

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: ask 的诊断文案与人设跟随语言

诊断文案不是彩蛋是主路径：绝大多数访客落在 unsupported，
英文默认站点上这块必须是英文。system prompt 也要求模型用当前语言回答。"
```

---

### Task 7: index.html 英文化与 README.en.md

**Files:**
- Modify: `index.html`
- Modify: `vite.config.ts`
- Create: `README.en.md`
- Modify: `README.md`
- Modify: `src/seo/renderStaticResume.test.ts`（若 fixture 受影响）

- [ ] **Step 1: index.html 英文化**

`index.html:2` 的 `<html lang="zh-CN">` 改为 `<html lang="en">`。

`<title>`、`description`、`og:*`、`twitter:*` 全部改英文：

```html
<title>cuixiaohan — Full-stack Engineer</title>
<meta name="description" content="cuixiaohan's terminal-style homepage: type Linux commands to browse the résumé, projects and contact details." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://i.xiaohan.dev" />
<meta property="og:title" content="cuixiaohan — Full-stack Engineer" />
<meta property="og:description" content="cuixiaohan's terminal-style homepage: type Linux commands to browse the résumé, projects and contact details." />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="cuixiaohan — Full-stack Engineer" />
<meta name="twitter:description" content="cuixiaohan's terminal-style homepage: type Linux commands to browse the résumé, projects and contact details." />
```

`<a class="skip-link">` 的文案改为 `Skip to accessible résumé`。

- [ ] **Step 2: 确认静态简历注入的是英文**

Run: `pnpm build && grep -c "Full-stack engineer focused on front-end" dist/index.html`
Expected: 至少 1 —— 英文 about.md 的正文确实进了产物。

若为 0，检查 Task 2 Step 7 里 `vite-plugin-static-resume.ts` 的 `CONTENT_DIR` 是否已改为 `src/content/en`。

- [ ] **Step 3: 写 README.en.md**

Create `README.en.md`，与现有 `README.md` 结构一一对应。顶部加语言切换行：

```markdown
[English](./README.en.md) · [中文](./README.md)

# terminal-site

A static, terminal-style personal homepage. Visitors type Linux commands to
browse the content.

## Quick start

    pnpm install
    pnpm dev

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Local development |
| `pnpm build` | Production build, output in `dist/` |
| `pnpm preview` | Preview the production build |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint |

## Editing content

Day-to-day résumé edits **only touch `src/content/`** — no code changes needed:

- `en/about.md`, `zh/about.md` — body text for the `about` command and the static résumé
- `en/contact.md`, `zh/contact.md` — contact details
- `en/projects/*.md`, `zh/projects/*.md` — one file per project; adding a file adds a project
- `en/skills.json`, `zh/skills.json` — skill groups, `level` from 1 to 5

Run `pnpm build` afterwards; the static résumé and the virtual filesystem both
pick the changes up automatically.

## Architecture

    src/core/       Shell kernel. Plain TypeScript, zero React, unit-testable under Node
    src/core/ai/    Adapter for Chrome's built-in model; the only file touching globalThis.LanguageModel
    src/commands/   Built-in commands, plain TypeScript
    src/i18n/       Language constants and the command description lookup table
    src/ui/         React rendering layer
    src/ui/chat/    Chat-mode state machine and thinking indicator
    src/ui/commands/  Commands needing rich output (clickable cards, charts)
    src/content/    Content source, one directory per language
    src/seo/        Static résumé injected at build time

`src/core/` and `src/commands/` **must not depend on React at runtime**; ESLint
enforces this. Commands that build React elements go in `src/ui/commands/`.

## Adding a command

Implement the `Process` contract:

```ts
import type { Process } from '../core/process'

export const hello: Process = {
  name: 'hello',
  description: 'Say hello',
  usage: 'hello [name]',
  async run(io, ctx) {
    io.stdout.writeLine(`Hello, ${io.argv[1] ?? ctx.env.get('USER')}`)
    return 0
  },
}
```

Then add it to `builtins` in `src/commands/index.ts`. Optionally add its
description to `src/i18n/commands.ts` — without an entry it falls back to the
`description` on the `Process` itself.

Commands send and receive through `io.stdin` / `io.stdout`, so pipes and
redirection work for free.

## Deployment

Pushing to `main` deploys to GitHub Pages via GitHub Actions. The custom domain
`i.xiaohan.dev` comes from `public/CNAME`; the site is served at the root path.

Changing the domain means changing four places: `public/CNAME`, the repository
root `CNAME` (generated by GitHub), `og:url` in `index.html`, and the `url`
passed to the static résumé plugin in `vite.config.ts`.
```

- [ ] **Step 4: README.md 顶部加语言链接**

`README.md` 第一行之前插入：

```markdown
[English](./README.en.md) · 中文
```

同时把「改内容」一节的文件路径更新为分语言后的结构（`en/about.md` 等），并在架构表里补 `src/i18n/`。

- [ ] **Step 5: 验证**

Run: `pnpm test && pnpm lint && pnpm exec tsc -b && pnpm build`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "docs: index.html 英文化，新增 README.en.md

静态简历注入英文，html lang 改 en，与默认语言一致。
README 两份互相链接，并更新分语言后的内容路径。"
```

---

## 完成标准

- [ ] `pnpm lint` 无输出
- [ ] `pnpm test` 全绿，原有 524 条无回归
- [ ] `pnpm exec tsc -b` 无错误
- [ ] `pnpm build` 成功
- [ ] `grep -c "Full-stack engineer" dist/index.html` ≥ 1（静态简历注入的是英文）
- [ ] `grep 'html lang="en"' dist/index.html` 命中
- [ ] 手动验证：
  - 首次访问（清空 localStorage）默认英文，`help` 显示英文描述
  - `lang zh` 后提示符下方出现临时文件提示，`cat about.md` 变中文，`help` 变中文
  - `lang` 无参数列出两种语言并标记当前值
  - `lang klingon` 报错，退出码非 0
  - 刷新页面语言保持
  - 切到中文后 `<html lang>` 变成 `zh-CN`（DevTools 里看）
  - 彩蛋（`sudo`、`fortune`）在两种语言下都仍是中文
  - `ask --status` 的文案跟随语言
