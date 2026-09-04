# ask 对话模式设计

2026-09-04

## 背景

`ask` 命令的第一版已经落地：`src/core/ai/languageModel.ts` 适配 Chrome 内置
Prompt API，`src/commands/ai/ask.ts` 提供一次性问答与管道输入，30 个用例覆盖
四态可用性判断、流式拼接、人设注入与中断。

实际用下来暴露一个问题：**从回车到第一个 token 之间完全静默**。创建 session
加首 token 可能要好几秒，用户不知道该等，会以为卡死。`downloadable` 状态更糟——
提示「去下载」，但那是 2GB 的模型文件，进度完全看不见，也没告诉用户怎么触发下载。

单纯加一个静态提示行能缓解，但解决不了更根本的问题：一次性问答没有上下文延续，
问一个追问就要重新建 session、重新注入简历。真正合适的形态是进入一个对话模式。

## 目标

- 输入 `ask` 进入对话模式，多轮对话共享同一个 session（因而有上下文记忆）
- 等待期间有明确的视觉反馈，用户知道在等什么、等了多久
- `downloadable` 时真正触发下载并显示进度
- 保留一次性 `ask <问题>` 与管道形式，行为不变

## 非目标

- 不做多会话管理、不做对话持久化。刷新页面即清空，与终端其余部分的语义一致。
- 不接任何远程模型。跑不了就是跑不了，这是这个功能的诚实前提。

## 架构决策

### 模式状态放在 UI 层

考虑过三个位置：

| 方案 | 取舍 |
|---|---|
| **A. UI 层（`useTerminal`），命令通过 `Host` 请求进入** | kernel 一行不改；`Host` 本就是命令向 UI 要能力的逃生舱 |
| B. kernel 持有模式状态 | 把「交互模式」这个纯 UI 概念塞进内核，破坏「`src/core/` 零 React、可在 Node 单测」这条卖点 |
| C. 通用「前台程序」抽象 | 真实终端确实这么做，但目前只有一个消费者，YAGNI |

**选 A。** `Host` 已有 `clear()`、`setTheme()` 这类「命令请求 UI 做一件事」的方法，
`enterChat()` 与它们完全同构。

这个选择还带来一个实际好处：进入模式后，block 由 UI 自己构造，不再受 `Writer`
纯追加契约的约束。思考指示器可以被直接替换掉，不需要 `matrix` 那种自渲染
node chunk 的把戏。

### 入口分流

`ask` 保持单一命令，按参数分流：

    ask                      进入对话模式
    ask 你会 React 吗         一次性问答（现有行为不变）
    cat about.md | ask 总结   一次性；管道场景本就不该进入交互模式
    ask --status             查询可用性

`ask` 无参时**先查 `status()`，不 ready 就打印诊断并且不进入模式**。
不能让用户进了模式才发现跑不了——那时他还得再学一次怎么退出。

## 接口变更

### Host

```ts
export interface Host {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
  enterChat(opts: { systemPrompt: string }): void   // 新增
}
```

`enterChat` 是「请求」而非「保证」：UI 可能因为已在模式中而忽略它。命令调用后
立即返回 0，不等待模式结束——命令的生命周期与模式的生命周期是分开的。

### useTerminal 状态机

```
chat: null                          submit 走 kernel.run()
chat: { session, phase, inputs }    submit 走 chatTurn()

phase:  'idle' | 'thinking' | 'streaming'
inputs: string[]  模式内提交过的输入，供 ↑/↓ 回溯；退出即丢弃
```

状态迁移：

    idle --(用户提交)--> thinking --(首个分片)--> streaming --(流结束)--> idle
                            |                        |
                            +--(中断/出错)-----------+--> idle

## 交互契约

| 操作 | shell 模式 | 对话模式 |
|---|---|---|
| 提示符 | `kernel.prompt()` | `ask> `（换色） |
| Enter | 执行命令 | 发给模型 |
| Ctrl+C（生成中） | 中断命令 | 中断本轮，保留已生成内容，留在模式内 |
| Ctrl+C（空闲） | 清空当前输入 | 退出模式 |
| Ctrl+D | — | 退出模式 |
| `exit` | 彩蛋文案 | 退出模式 |
| Tab | 路径/命令补全 | 禁用（没有路径可补） |
| ↑ / ↓ | shell 历史 | 本次对话的输入，不污染 shell 历史 |

**Ctrl+C 的两级语义需要独立于现有的 `abortRef` 单槽。** 现在那个槽表达的是
「有没有命令在跑」，而对话模式下命令早已返回、模式还活着；「中断本轮生成」
和「中断命令」是两件不同的事，共用一个槽会让退出逻辑和防重入守卫互相污染。

## 数据流：一轮对话

1. `submit(line)` 看到 `chat !== null`，走 `chatTurn(line)`
2. 造一个 chat 样式的 block，phase 置 `thinking`。指示器是这个 block 的**渲染态**
   而非一个独立 chunk——`phase === 'thinking'` 时 block 渲染点点动画与计时
3. 调 `session.promptStreaming(line, { signal })`
4. 首个分片到达：phase 转 `streaming`，指示器随之不再渲染，分片逐片追加进
   同一个 block 的 chunks
5. 流结束：phase 回 `idle`

指示器不占用 chunks，所以中断或出错时不需要「删掉那个 chunk」——
它本来就不在里面。这正是模式内自建 block 相对 `Writer` 契约的好处。

计时从第 2 步开始显示，因为首次唤醒模型确实慢，把耗时摆出来比让用户猜要好。

## 错误处理

| 情况 | 行为 |
|---|---|
| 用户中断 | 保留已生成部分，追加一行「已中断」，留在模式内 |
| 模型抛异常 | 红色错误行，留在模式内——单轮失败不该踢人出去 |
| session 失效 | 说明原因，`destroy()` 后退回 shell |
| 退出模式 | 必定调用 `session.destroy()`；模型常驻显存，不放是泄漏 |

## 下载进度

独立于对话模式的一项改进。`downloadable` 时不再只是提示「去下载」，而是用
`create({ monitor })` 真正触发下载：

```ts
const session = await LanguageModel.create({
  monitor(m) {
    m.addEventListener('downloadprogress', e => onProgress(e.loaded))
  },
})
```

在终端里画一个文本进度条。这解决的是同一个问题的另一半：用户不仅要知道该等，
还要知道等的是什么、还剩多久。

## 测试策略

现有 30 个用例全部保留，一次性 `ask` 的行为不能回归。

新增覆盖：

- **`Host.enterChat` 契约**：`ask` 无参且 ready 时调用它；不 ready 时不调用
- **模式状态机**（`useTerminal.test.tsx`，用 `fakeAi`）：
  - 进入模式后提示符改变，submit 不再走 kernel
  - `exit` / Ctrl+D / 空闲态 Ctrl+C 各自能退出，且都调用了 `destroy()`
  - 生成中 Ctrl+C 中断本轮但不退出模式
  - phase 从 thinking 正确转到 streaming
  - 模型抛异常后仍在模式内
  - 模式内的输入不进 shell 历史
- **下载进度**：monitor 回调驱动的进度渲染

纯逻辑（状态分流、systemPrompt 构造）继续在 Node 环境单测，不引入 jsdom。

## 风险

**`Host` 接口扩张。** 每加一个 `enterXxx` 都在把 UI 概念推进命令层。目前一个
消费者，可接受；出现第二个交互式命令时应当回头考虑方案 C 的前台程序抽象，
而不是继续加方法。

**模式状态与 `abortRef` 的交互。** 这是本次改动最容易出错的地方——现有的防重入
守卫依赖 `abortRef` 的释放路径，新增的模式状态必须不破坏那个不变量。
测试要显式覆盖「模式内提交 → 中断 → 再提交」这条路径。
