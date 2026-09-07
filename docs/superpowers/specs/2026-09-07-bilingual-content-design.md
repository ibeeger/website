# 中英双语内容设计

2026-09-07

## 背景

站点内容目前全是中文。目标受众里有相当一部分读英文，而个人主页的第一眼决定了对方
要不要继续读下去——一个英文读者打开满屏中文，多半直接关掉。

同时这个站点已经积累了不少中文文案：46 处命令的 `description` / `usage`、
`/etc/motd`、开机动画、`ask` 的四态诊断，以及 `src/content/` 下的简历正文。
它们散在不同的层里，加语言这件事必须一次想清楚落点，否则会变成散弹式的字符串替换。

## 目标

- 内容与命令描述支持中英双语，**默认英文**
- 新增 `lang` 命令切换，选择持久化
- 构建期注入的静态简历用英文，`<html lang="en">`
- 命令实现文件**一行不改**——语言不是命令该操心的事
- 新增 `README.en.md`（面向看仓库的开发者，与站点内容是两回事）

## 非目标

- **不做浏览器语言嗅探。** `navigator.language` 会让同一个 URL 对不同人显示不同内容，
  对个人主页这种「把链接发给别人看」的场景是负担而非便利。
- **彩蛋保持中文**（`sudo` / `fortune` / `cowsay` / `exit` / `neofetch` 的文案）。
  它们藏在 `help` 之外、留给人自己发现，中文本身就是彩蛋属性的一部分。
- 不做第三种语言。结构上不排斥，但现在不为它付设计成本。

## 架构决策

### 语言是内容层的参数，不是内核的概念

考虑过三个位置：

| 方案 | 取舍 |
|---|---|
| **A. 内容层参数 + `lang` 重建 VFS** | 命令层零改动；`src/content/index.ts` 本就是「core 与 Vite 之间的唯一接缝」，参数加在那里最小侵入 |
| B. `Ctx.lang` 作为上下文的一等公民 | 要改 46 处命令，且把展示层概念推进了内核契约 |
| C. 双 VFS 实例，切换时换引用 | 省了重建，但两份 VFS 各自积累用户 `touch` 的临时文件，状态分叉更难理解 |

**选 A。** 关键收益是命令层完全不知道语言这回事——它们只是读文件，读到什么由 VFS 决定。

### `lang` 与 `theme` 同构

`theme` 已经跑通了「命令 → `Host` → React 状态 → localStorage」这条链
（`src/commands/sys/theme.ts` + `src/ui/useTheme.ts`）。`lang` 照搬同一形状，
包括隐私模式下 `localStorage` 抛异常时回落默认值的 try/catch。

这条链已被验证，不发明新的。

## 接口变更

### Host

```ts
export interface Host {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
  enterChat(opts: { systemPrompt: string }): void
  setLang(lang: Lang): void      // 新增
  currentLang(): Lang            // 新增
}
```

`Host` 接口这次扩张两个方法。上一份设计文档的「风险」一节点名过这个问题，
且指出「接口只扩张了一次，但复制品已经有四份」——`kernel.test.ts`、
`executor.test.ts`、`expand.test.ts` 各自维护一份 noop host 字面量，
外加 `testkit.ts` 的 `testHost`。

**本次实现必须先把这三处 core 测试的 noop host 收敛成一个共享 fixture，再加新方法。**
否则第五个方法出现时是七份复制品。这是设计的一部分，不是可选的清理。

### 内容加载

```ts
export type Lang = 'en' | 'zh'
export const DEFAULT_LANG: Lang = 'en'

export function loadContent(lang: Lang): Record<string, string>
```

`import.meta.glob` 仍然一次性抓全部 Markdown（构建期内联为字符串，不产生额外请求），
`loadContent` 只是按语言挑出该用哪些。

### 命令文案表

46 处 `description` / `usage` 不进 `Process` 契约——那会让每个命令都背上翻译职责，
也会让新增命令必须先想好两种语言才能落地。改为外置查找表：

```ts
// src/i18n/commands.ts
export const COMMAND_TEXT: Record<Lang, Record<string, {
  description: string
  usage?: string
}>>
```

`help` 与 `man` 渲染时查表，**查不到就回落到 `Process` 自带的字段**。
这条回落是关键：新增命令不写翻译也能工作，只是显示原文。

## 目录结构

```
src/content/
  en/
    about.md  contact.md  skills.json  projects/*.md
  zh/
    about.md  contact.md  skills.json  projects/*.md
  system.ts       # motd 分语言；passwd 与 /proc/version 语言无关
  index.ts        # loadContent(lang)
src/i18n/
  lang.ts         # Lang 类型、DEFAULT_LANG、LANG_STORAGE_KEY
  commands.ts     # COMMAND_TEXT 查找表
  ui.ts           # 开机动画、lang 命令自身、ask 诊断文案
```

## `lang` 命令

```
lang            显示当前语言与可选项（形如 theme 的列表）
lang en         切换到英文
lang zh         切换到中文
```

非法值：报错 + 列出可选项，退出码 1。与 `theme` 的错误形状一致。

## 切换时发生什么

1. `ctx.host.setLang(next)`
2. `useTerminal` 用新语言重建 VFS 与内核
3. `<html lang>` 属性跟着变——读屏软件据此切换发音
4. **打印一行提示，说明临时文件已清空**

第 4 条是必须的，不是可选的礼貌。用户可能 `touch` 过文件、`mkdir` 过目录，
重建 VFS 会让它们凭空消失。不提示就是静默丢数据。

## SEO 与静态简历

构建期只注入英文，`<html lang="en">`。`index.html` 的 `<title>`、`description`、
`og:*`、`twitter:*` 一并改英文。

代价明确：中文简历对搜索引擎不可见。接受这个代价，因为两份都注入会让读屏用户
把同一份简历听两遍，禁用 JS 时页面也长一倍——那是比 SEO 更实在的损失。

## ask 的语言

`ask` 的四态诊断文案并入双语集合。它不是彩蛋——绝大多数访客的浏览器跑不了内置模型，
落在 `unsupported`，看到的是一整段说明。英文默认站点上这块必须是英文。

人设 system prompt 也跟着语言走：英文模式下明确要求模型用英文回答。

## README.en.md

仓库是公开的，面向的是看源码的开发者，与站点内容是两回事——站点内容讲「我是谁」，
README 讲「这个东西怎么跑、怎么改」。

新增 `README.en.md`，内容与现有 `README.md` 对应。两份顶部互相链接：

```markdown
[English](./README.en.md) · 中文
```

**README 不参与 `lang` 命令**，它不在站点运行时里。这一点要在实现时说清楚，
避免有人以为切语言会影响仓库文档。

## 已确认的非问题

`src/ui/rich/skillsText.ts` 里的中文全部是注释，技能分组名（「语言」「前端」「工程」）
来自 `skills.json` 的 `groups[].name`，已被「按语言分内容文件」覆盖，无需单独处理。

`src/core/errors.ts` 的 VFS 错误消息（`No such file or directory` 等）本来就是英文，
贴合真实 shell，两种语言下都保持英文，不进翻译表。

`index.html` 目前硬编码 `<html lang="zh-CN">`，构建后要变成 `en`。

## 测试策略

现有 524 条不得回归。新增覆盖：

- `loadContent('en')` 与 `loadContent('zh')` 各自的文件树内容不同且都完整
- `lang` 命令：无参显示当前值、切换成功、非法值报错与退出码、Tab 补全
- **切换后 VFS 内容真的变了**——断言 `cat about.md` 的输出不同，而不是只断言某个标记位
- `help` / `man` 在两种语言下的输出
- **回落路径**：`COMMAND_TEXT` 里没有的命令仍显示 `Process` 自带的描述
- `<html lang>` 随切换更新
- 临时文件丢失的提示确实打印了

## 风险

**`Host` 接口继续扩张。** 这次加两个方法，总数到七个。上一份设计已经点名过这个趋势。
本次强制要求先收敛 noop host 的四份复制品，但那只是止血——`Host` 正在变成
「命令想让 UI 做的一切」的杂物抽屉。**出现第八个方法之前，应当认真考虑把它拆成
按能力分组的若干接口，或者引入上一份设计里提过的「前台程序」抽象。**

**VFS 重建与用户临时文件的冲突。** 提示能缓解但消除不了。若将来用户抱怨，
备选是只重建内容文件、保留用户创建的节点——但那需要 VFS 能区分「内容」与「用户数据」，
是个更大的改动，现在不做。

**翻译漂移。** 中英两份内容会各自演化，最终不一致。这是所有 i18n 的固有问题，
没有便宜的技术解。缓解手段是内容尽量短、结构对齐，让人一眼看出哪边缺了什么。
