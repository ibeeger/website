[English](./README.en.md) · 中文

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

日常改简历**只需要动 `src/content/`**，不需要碰代码。内容按语言分成 `en/` 与
`zh/` 两套目录：

- `en/about.md`、`zh/about.md` —— `about` 命令与静态简历的正文
- `en/contact.md`、`zh/contact.md` —— 联系方式
- `en/projects/*.md`、`zh/projects/*.md` —— 一个文件一个项目，新增文件即新增项目（复制一份现有的改内容即可）
- `en/skills.json`、`zh/skills.json` —— 技能分组，`level` 取值 1–5

改完直接 `pnpm build`，静态简历与虚拟文件系统都会自动同步。

## 架构

    src/core/       shell 内核。纯 TypeScript，零 React 依赖，可在 Node 中单测
    src/core/ai/    Chrome 内置模型适配层，唯一接触 globalThis.LanguageModel 的地方
    src/commands/   内置命令，纯 TypeScript
    src/i18n/       语言常量与命令描述查表
    src/ui/         React 渲染层
    src/ui/chat/    对话模式状态机与思考指示器
    src/ui/commands/  需要富输出（可点击卡片、图表）的命令
    src/content/    内容源，按语言分目录
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

然后加进 `src/commands/index.ts` 的 `builtins`。也可以在 `src/i18n/commands.ts`
里补一条它的描述——不补的话会退回到 `Process` 自身的 `description`。

命令通过 `io.stdin` / `io.stdout` 收发数据，因此天然支持管道与重定向。

## WASM 扩展

命令契约刻意设计成 WASM 模块可以直接实现的形状：`IO` 是流式的，
`Registry.register()` 可在运行时调用。接入一个 `.wasm` 模块时，
只需新增 `src/core/wasm/loader.ts` 把 WASI 的 stdin/stdout 桥接到 `IO` 上，
`src/core/` 下的其他文件都不需要改动。

## Google 登录

`login` 用 Google 账号登录，登录后提示符、`whoami` 与开机欢迎语都会认得你，
`logout` 退出。**纯前端实现**：拿到的 ID token 只留在内存里，落进 localStorage
的只有姓名、邮箱、Google 用户 ID（sub）以及头像地址（如果 Google 返回了的话）——
没有任何后端参与，也不解锁任何隐藏内容。

构建需要 `VITE_GOOGLE_CLIENT_ID`。本地开发把它写进 `.env.local`，
并把 `http://localhost:5173` 加进 Google Cloud Console 的
Authorized JavaScript origins。

## 部署

推送到 `main` 分支后由 GitHub Actions 自动部署到 GitHub Pages，
自定义域名 `i.xiaohan.dev` 由 `public/CNAME` 指定，站点服务于根路径。

改域名要同时改四处：`public/CNAME`、仓库根目录的 `CNAME`（GitHub 自动生成）、
`index.html` 的 `og:url`、`vite.config.ts` 传给静态简历插件的 `url`。

若改回 `user.github.io/<repo>/` 形式的子路径部署，构建时指定 base：

    VITE_BASE=/terminal-site/ pnpm build
