# 终端风格个人主页 —— 设计文档

日期：2026-09-03
状态：待评审

## 1. 目标

构建一个纯静态网站，以 Linux 终端为唯一交互界面，承载作者的个人介绍与项目经历。访客通过输入命令浏览内容，而非点击导航。

具体目标：

- 交互式简历：`whoami`、`cat about.md`、`ls projects/`、`skills` 等命令替代传统页面导航。
- 拟真 shell：具备虚拟文件系统、管道、重定向、环境变量、历史与 Tab 补全，而非一张命令-文案对照表。
- 富输出：命令输出可以内嵌可点击链接、彩色图表、图片，而不止于纯文本。
- WASM 就绪：命令的执行契约现在就设计成 WASM 模块可以直接实现的形状，未来挂载 `.wasm` 模块无需重构内核。
- 可被检索：搜索引擎与读屏软件能读到完整简历内容。

## 2. 非目标

明确不做，避免范围蔓延：

- 不做后端、不做数据库、不做用户账号。产物是一堆静态文件。
- 不做真·全屏 ANSI 程序（vim、htop、top）。渲染层是 React DOM，不解析 ANSI 转义序列。
- 不做文件系统持久化。写操作只改内存，刷新即还原。
- 不做多标签、多窗口、分屏。
- 本期不写任何 WASM 代码，只预留契约。

## 3. 技术栈

| 项 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite 8 | 静态产物，`import.meta.glob` 用于内容打包 |
| UI | React 19 | |
| 语言 | TypeScript **5.9.3** | 不用 7.0：typescript-eslint 8.69 的 peer 约束为 `>=4.8.4 <6.1.0`，上 TS 7 会失去 lint |
| 包管理 | pnpm | |
| 测试 | Vitest 4 | core 层在 Node 环境跑，UI 层用 jsdom |
| Lint | ESLint + typescript-eslint 8 | |

不引入 UI 组件库。样式用原生 CSS + CSS 变量（主题切换靠变量重绑定），不引入 CSS-in-JS。

## 4. 架构

### 4.1 核心约束

`src/core/` 是纯 TypeScript，**不 import 任何 React，不触碰 DOM**。它能脱离浏览器在 Node 里完整单测。React 只是这个内核的一个渲染前端。

内核需要影响 UI 时（清屏、切主题），通过注入的 `Host` 接口调用——内核只见接口，不见实现。

### 4.2 目录结构

```
src/
  core/
    vfs/
      inode.ts          节点类型定义
      vfs.ts            树操作：resolve / read / write / mkdir / unlink / list
      path.ts           路径规范化（. .. ~ 绝对/相对）
    shell/
      lexer.ts          分词：引号、转义、变量占位
      parser.ts         AST：pipeline / redirect / list(; && ||)
      expand.ts         变量展开 $VAR、~ 展开、glob（* ?）
      executor.ts       执行 AST，串联进程与管道
      env.ts            环境变量表、cwd、$?
    process.ts          Process / IO / Chunk / Ctx / Host 契约定义
    pipe.ts             轻量流实现
    registry.ts         命令注册表
    kernel.ts           对外门面：kernel.run(line) -> OutputBlock
  commands/
    index.ts            汇总注册内置命令
    fs/                 ls cd pwd cat tree touch mkdir rm find head tail wc
    text/               echo grep sort uniq
    sys/                help man whoami uname date env export which history clear
    site/               about projects skills contact resume theme open
    fun/                sudo cowsay neofetch fortune matrix exit
  ui/
    Terminal.tsx        容器：滚动、聚焦、块列表
    PromptLine.tsx      输入行：隐藏 input + 自绘光标 + 补全提示
    OutputBlock.tsx     一次命令的输出渲染
    ChunkView.tsx       Chunk -> ReactNode 的渲染分发
    BootSequence.tsx    启动动画
    MobileKeyBar.tsx    移动端快捷键条
    useTerminal.ts      React 与 kernel 的桥接 hook
    host.ts             Host 接口的 React 实现
    themes/             主题定义（CSS 变量组）
  content/
    about.md
    contact.md
    projects/*.md
    skills.json         结构化技能数据（供 skills 命令做图表）
  seo/
    renderStaticResume.ts   由 content/ 生成语义化 HTML 字符串（纯函数，无 React）
    vite-plugin-static-resume.ts  构建时经 transformIndexHtml 注入 index.html
  main.tsx
  styles/
```

一命令一文件。文件变大即拆分。

## 5. 核心契约

这是整个工程的支点，也是 WASM 的接入点。

```ts
// core/process.ts

export type Style = {
  color?: string        // 语义色名，映射到主题 CSS 变量
  bold?: boolean
  dim?: boolean
  underline?: boolean
}

export type Chunk =
  | { type: 'text'; text: string; style?: Style }
  | { type: 'node'; node: ReactNode; toText: () => string }

export interface Writer {
  write(chunk: Chunk): void
  writeText(text: string, style?: Style): void   // 便捷包装
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

export interface Ctx {
  cwd: string
  env: Env
  vfs: VFS
  registry: Registry
  host: Host
  signal: AbortSignal        // Ctrl+C
}

export interface Process {
  name: string
  description: string        // help 列表用
  usage?: string             // man 用
  complete?(argv: string[], ctx: Ctx): string[]
  run(io: IO, ctx: Ctx): Promise<number>   // 返回 exit code
}
```

### 5.1 Chunk 的两个分支

`text` 分支保证任何命令的输出都能被管道、grep、重定向处理。
`node` 分支让 `projects` 输出可点击卡片、`skills` 输出彩色条形图。

**降级规则：** `node` chunk 经过管道进入下游进程时，自动调用 `toText()` 转成 `text` chunk。因此 `projects | grep rust` 正常工作。`toText` 是 `node` chunk 的必填字段，不是可选优化。

### 5.2 为什么 IO 用流而不是返回字符串

唯一理由是 WASM。WASI 程序的模型是"从 fd 0 读、往 fd 1 写"，只有流式 IO 能无损桥接。这是本期为 WASM 付出的两笔预留成本之一。

### 5.3 pipe.ts

不使用 Web Streams（其背压与锁定语义对本场景无用且难测）。自研轻量实现：

```ts
export function createPipe(): { writer: Writer; reader: AsyncIterable<Chunk> }
```

内部是一个带 async 唤醒的 chunk 队列，`close()` 结束迭代。约 60 行，纯函数逻辑，易于单测。

### 5.4 registry.ts

```ts
export interface Registry {
  register(p: Process): void        // 运行时可注册 —— 第二笔 WASM 预留成本
  get(name: string): Process | undefined
  list(): Process[]
}
```

内置命令在启动时批量 register。未来 WASM 模块加载后走同一个 `register`。

## 6. WASM 扩展路径（本期不实现）

本期只付出 5.2 与 5.4 两笔成本，不做任何额外抽象。未来接入时新增一个文件即可：

```ts
// 未来：core/wasm/loader.ts
export async function loadWasmProcess(
  name: string,
  wasmUrl: string,
  meta: { description: string; usage?: string }
): Promise<Process>
```

实现要点（届时再做）：实例化模块，为其提供 WASI preview1 的最小 shim（`fd_read` / `fd_write` / `args_get` / `proc_exit`），把 `IO.stdin` 的 chunk 转成字节喂给 `fd_read`，把 `fd_write` 的字节解码后写入 `IO.stdout`。VFS 是否暴露给 WASI 的 `path_open` 留待那时决定，本期不预设。

**验收标准：** 未来接入 WASM 时，`core/` 下除新增 `wasm/` 目录外不应有文件被修改。若届时需要改动 `process.ts`，说明本期契约设计失败。

## 7. 虚拟文件系统

内存中的 inode 树：

```ts
type Inode =
  | { kind: 'file'; name: string; content: string; mime?: string; mtime: number }
  | { kind: 'dir'; name: string; children: Map<string, Inode>; mtime: number }
```

初始树在构建时生成：

```
/
├── home/guest/          $HOME，初始 cwd
│   ├── about.md
│   ├── contact.md
│   ├── projects/        由 content/projects/*.md 生成
│   └── .bashrc          彩蛋文本
├── etc/
│   ├── motd             启动欢迎语
│   └── passwd           彩蛋
└── proc/
    └── version          彩蛋：伪造的内核版本串
```

`content/` 下的 Markdown 通过 `import.meta.glob('../content/**/*.md', { as: 'raw', eager: true })` 在构建时读入，由 `buildInitialVfs()` 组装成树。改内容不需要碰代码。

写操作（`>`、`>>`、`touch`、`mkdir`、`rm`）只改内存，刷新还原。不做 localStorage 持久化。

## 8. Shell 解析与执行

### 8.1 支持的语法

- 管道：`a | b | c`
- 重定向：`> file`、`>> file`、`2> file`
- 命令列表：`;`、`&&`、`||`
- 引号：`'单引号'`（不展开）、`"双引号"`（展开变量）、反斜杠转义
- 变量：`$VAR`、`${VAR}`、`$?`
- 波浪号：`~` 展开为 `$HOME`
- Glob：`*`、`?`（仅路径参数，在 expand 阶段对 VFS 求值）

不支持（明确排除）：子 shell `$()`、后台 `&`、函数定义、控制流 `if/for/while`、heredoc。

### 8.2 执行流程

`lexer → parser → expand → executor`。

executor 对一条 pipeline 的处理：为 n 个进程创建 n-1 个 pipe，全部 `run()` 并发启动，`Promise.all` 等待。上游 `close()` 触发下游 stdin 迭代结束。pipeline 的退出码取最后一个进程。

Ctrl+C 触发 `AbortController.abort()`，长任务命令需自行检查 `ctx.signal.aborted`。

### 8.3 错误处理

- 命令不存在：`bash: xxx: command not found`，退出码 127。
- 参数错误：命令自己写 stderr，退出码 1 或 2。
- 进程抛出未捕获异常：executor 捕获，输出 `bash: xxx: internal error: <msg>` 到 stderr，退出码 1。**内核不允许把异常抛到 React 层**——任何命令崩溃都不能白屏。
- 解析错误：`bash: syntax error near unexpected token 'xxx'`，退出码 2。

## 9. React 渲染层

### 9.1 状态模型

Terminal 持有 append-only 的 block 数组：

```ts
type Block = {
  id: string
  prompt: string        // 执行时刻的提示符快照
  input: string         // 用户输入的原始命令行
  chunks: Chunk[]       // stdout + stderr 交错的输出
  exitCode: number | null   // null = 运行中
}
```

流式输出：`Writer.write()` 触发 React 状态更新，输出边产生边显示。为避免高频命令逐 chunk 触发重渲染，写入用 microtask 批量合并后再 setState。

### 9.2 输入行

**必须使用隐藏的真实 `<input>` 元素 + CSS 自绘光标。** 不用 `contenteditable`，不用纯 keydown 监听。这是同时正确处理中文输入法（composition 事件）和移动端虚拟键盘的唯一可靠做法。

- 真 input：`opacity: 0`，绝对定位覆盖在输入行上，承接所有键盘与 IME 事件。
- 自绘：读 input 的 `value` 与 `selectionStart`，渲染成带光标的文本。
- 输入法组合期间（`compositionstart` → `compositionend`）显示原始 composition 文本，不触发补全。

### 9.3 键位

| 键 | 行为 |
|---|---|
| Enter | 执行 |
| ↑ / ↓ | 历史导航 |
| Tab | 补全（命令名 / 路径，调 `Process.complete()`） |
| Ctrl+C | 中断当前命令 / 清空当前输入 |
| Ctrl+L | 清屏 |
| Ctrl+R | 历史反向搜索 |
| Ctrl+A / Ctrl+E | 行首 / 行尾 |
| Ctrl+U / Ctrl+K | 删至行首 / 行尾 |
| Ctrl+W | 删除前一个词 |

Tab 补全有多个候选时列出候选并补全公共前缀，与 bash 行为一致。

### 9.4 性能

长输出虚拟化本期不做。设一个上限：block 数超过 500 时丢弃最旧的（与真实终端的 scrollback 限制一致）。真出现卡顿再引入虚拟列表。

## 10. 视觉与主题

干净现代终端风格，参考 iTerm2：深色背景、等宽字体、语义化配色、闪烁块状光标。不加 CRT 滤镜。

主题实现为一组 CSS 变量（背景、前景、光标、ANSI 16 色、选区色）。内置 dracula / nord / gruvbox / one-dark，通过 `theme <name>` 命令切换，选择存 localStorage。

字体栈：`ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Noto Sans Mono CJK SC", monospace`。中文必须有等宽 CJK 回退，否则中英混排对齐会乱。

## 11. 启动动画

首次进入播放：逐行打字机效果输出 ASCII banner + `/etc/motd` 内容 + 提示 `Type 'help' to get started.`。

- 任意按键立即跳过，直接显示完整内容。
- 播放状态存 sessionStorage，同一会话内刷新不重播。
- 遵循 `prefers-reduced-motion`：该媒体查询为 `reduce` 时直接跳过动画。

## 12. 移动端

- 视口适配：字号随视口缩放，最小 12px。
- 虚拟键盘遮挡：监听 `visualViewport` 的 `resize`，输入行始终滚动到可视区内。
- `MobileKeyBar`：吸附在输入框上方的快捷键条，提供 `Tab`、`Ctrl+C`、`↑`、`↓`、`|`、`~`、`/`、`-` 这些手机键盘打不出或难打的键。仅在触摸设备显示（`(hover: none)` 媒体查询）。
- 命令输出的横向溢出改为横向滚动，不强制换行破坏对齐。

## 13. 彩蛋

`sudo`（回 `guest is not in the sudoers file. This incident will be reported.`）、`rm -rf /`（假装删除后恢复并吐槽）、`cowsay`、`neofetch`（ASCII logo + 伪造系统信息）、`fortune`、`matrix`（数字雨，Ctrl+C 退出）、`exit`（提示无处可逃）。

彩蛋放 `commands/fun/`，与正经命令隔离，`help` 中不列出，留给用户自己发现。

## 14. SEO 与无障碍降级层

终端界面对搜索引擎和读屏软件是不可用的。因此：

- 静态简历**必须在构建时注入 index.html，而不是由 React 在运行时渲染**。否则不执行 JS 的爬虫与禁用 JS 的用户都拿不到内容，`<noscript>` 也无从填充。
- 实现：`seo/renderStaticResume.ts` 是一个纯函数，读 `content/` 产出语义化 HTML 字符串（`<h1>/<h2>/<p>/<ul>/<a>` 结构，含 JSON-LD `Person`）。自定义 Vite 插件在 `transformIndexHtml` 钩子中将其注入 `#static-resume` 容器与 `<noscript>` 两处。
- React 的挂载点是另一个独立容器，React 永不触碰 `#static-resume` 节点。
- 该节点用 visually-hidden 技法（clip-path 裁剪，非 `display:none`）隐藏——**对爬虫与读屏可见，对视觉用户不可见**。
- 页面首个可聚焦元素是一个 skip link：「跳到无障碍简历版本」，键盘/读屏用户按 Tab 即可到达。
- 终端容器标注 `role="application"` 与 `aria-label`，输出区标注 `aria-live="polite"`，使读屏用户在选择留在终端时也能听到命令输出。
- `<noscript>` 中同样输出这份静态简历（同一构建步骤注入，不重复维护）。

## 15. 命令清单（首期）

**文件系统**：`ls`（`-l -a`）、`cd`、`pwd`、`cat`、`tree`、`head`、`tail`、`wc`、`find`（仅 `-name`）、`touch`、`mkdir`、`rm`（`-r -f`）
**文本**：`echo`、`grep`（`-i -n -v`）、`sort`、`uniq`
**系统**：`help`、`man`、`whoami`、`uname`、`date`、`env`、`export`、`which`、`history`、`clear`
**站点**：`about`、`projects`、`skills`、`contact`、`resume`、`theme`、`open`
**彩蛋**：见 §13

`projects`、`skills` 输出富节点（卡片、条形图），其余输出纯文本。

## 16. 测试策略

TDD 推进，先写测试。

| 层 | 环境 | 覆盖重点 |
|---|---|---|
| `core/shell` | node | lexer 引号转义边界、parser AST 结构、expand 变量与 glob、executor 管道串联与退出码 |
| `core/vfs` | node | 路径规范化（`..` 越界到根）、增删改查、错误码 |
| `core/pipe` | node | 写入顺序保序、close 后迭代终止、消费者先于生产者到达时的等待 |
| `commands/` | node | 每个命令的 IO 契约：给定 argv/stdin，断言 stdout/stderr/exit code |
| `ui/` | jsdom | 冒烟：输入回车出输出、历史上下键、Tab 补全、IME 组合不误触发 |

不为彩蛋命令写详尽测试，冒烟即可。

## 17. 构建与部署

- `pnpm dev` / `pnpm build` / `pnpm preview` / `pnpm test` / `pnpm lint`
- 产物为纯静态文件，可部署至 GitHub Pages、Vercel、Netlify 或任意静态托管。
- Vite `base` 通过环境变量配置，以适配 GitHub Pages 的子路径部署。

## 18. 里程碑

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| M1 | 工程骨架、契约定义、Terminal 壳、`echo`/`help` | 能输入命令看到输出 |
| M2 | VFS + 内容管道 + `ls`/`cd`/`pwd`/`cat`/`tree` | `cat about.md` 显示真实简历内容 |
| M3 | lexer/parser/expand/executor + 管道重定向 + `grep`/`head`/`wc` | `cat about.md \| grep -i rust` 正确工作 |
| M4 | 交互完善：历史、Tab 补全、全部键位、Ctrl+C 中断 | 键位表全部可用 |
| M5 | 富输出命令 `projects`/`skills`/`about` + 主题 + 启动动画 | 视觉完成度达标 |
| M6 | 移动端、SEO 降级层、彩蛋、部署 | 上线 |

## 19. 未决事项

无。所有设计决策已在本文档确定。
