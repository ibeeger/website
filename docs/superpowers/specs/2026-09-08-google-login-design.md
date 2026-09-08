# Google 登录设计

2026-09-08

## 背景

站点目前没有任何身份概念：`USER` 恒为 `guest`，提示符恒为 `guest@terminal:~$`。
现在要接入 Google 登录，让终端「认得」访客。

同时这是一个**纯静态站**——GitHub Pages 部署在 `i.xiaohan.dev`，没有任何后端，
连 `ask` 的 AI 都跑在 Chrome 浏览器内置模型里。任何需要服务端的方案在这里都不成立。

## 目标

- 新增 `login` / `logout` 两个命令，走 Google 登录
- 登录后：提示符从 `guest@` 变成 `xiaohan@`，`whoami` 显示姓名与邮箱，
  开机欢迎语带上名字
- **身份持久、凭证不落盘**：关掉浏览器再来仍然「认得你」，但 ID token 只活在内存里
- **为后续的后端 API 能力奠定基础**：拿到的凭证必须正好是未来后端要的那一个

## 非目标

- **不做后端。** 不写任何 API 客户端、不做 `fetchWithAuth`。本设计只留座位（见「Ctx.auth」）。
- **不做权限。** 登录不解锁任何隐藏内容，不区分「是不是站长本人」。纯展示态。
  这条是刻意的：一旦要判断「谁有权看什么」，纯前端就守不住，必须有后端。
- **不做 One Tap。** 页面加载自动浮现的 Google 卡片会破坏终端沉浸感，
  且在 FedCM 下会被浏览器静默抑制。见下方「为什么不用 One Tap」。
- **不显示头像。** 终端里渲染图片是另一个量级的工作（采样成 ASCII 或直接嵌图），
  与「认得你」这个目标的收益不成比例。
- 不引入任何 npm 依赖。仓库当前的运行时依赖只有 react / react-dom，保持这个状态。

## 架构决策

### 凭证类型：ID token，不是 access token

这是整个设计的枢纽，因为它由「为后端奠基」这个目标倒推而来。

Google 提供的凭据是 **Web application 类型**，其 token 端点**强制要求 `client_secret`**。
所以「授权码 + PKCE 回跳」这条最正统的路在纯静态站上根本走不通——secret 一旦打进
`dist` 就是公开的。这同时意味着凭据里那个 `redirect_uris: https://auth.xiaohan.dev`
在本设计中完全用不到（该域名目前也未解析）。

剩下两条现实的路：

| 方案 | 拿到的东西 | 对未来后端的意义 |
|---|---|---|
| **A. `google.accounts.id` + 内联官方按钮** | **ID token（JWT）** | 后端用 Google 公钥验签 + 校验 `aud`，这是「Sign in with Google 接自有 API」的标准姿势，零改造 |
| B. `google.accounts.oauth2` token client | 不透明 access_token | access_token 是发给 **Google API** 的凭证，不该发给自己的后端；真要用，后端每次得多一跳 tokeninfo |

**选 A。** B 的弹窗触发确实更可靠，但它拿到的凭证与目标背道而驰。

### 为什么不用 One Tap

`google.accounts.id.prompt()` 能程序化触发，也能拿到 ID token，看似正好适配 `login` 命令。
但在 FedCM 时代，One Tap 会被浏览器**静默抑制**（用户此前 dismiss 过、第三方 Cookie 策略、
无痕模式……），而抑制原因的回调在 FedCM 下已被弃用。结果是 `login` 有相当概率
「敲完什么都没发生」，且**无法给出像样的错误提示**——这对一个命令行界面是不可接受的失败模式。

改用 `renderButton` 把官方按钮内联渲染进命令的输出块：点击必定弹窗，行为完全确定。
代价是终端里会出现一个 Google 品牌按钮，它活在 Google 的 iframe 里，只能选主题与尺寸，
没法完全终端化。**接受这个代价**——确定性优先于观感。

以后若要叠加 One Tap 作为增强（先试 prompt、失败落回按钮），结构上不排斥，但现在不做：
两条路径各自的降级分支不值得现在背。

### 适配层照抄 `languageModel.ts` 的形状

`src/core/ai/languageModel.ts` 立下的规矩是：**唯一接触浏览器全局的适配层 + 纯接口给命令用**，
并且对「全局不存在 / 形状不对 / 调用抛异常 / 返回未知值」逐一降级，绝不让访客看到炸掉的命令。

`src/ui/auth/gis.ts` 是这条规矩在 Google 身份服务上的复用：它是**唯一**接触
`window.google.accounts.id` 的地方，命令只依赖 `AuthStore` 接口。

这条链已被验证，不发明新的。

## 接口变更

### `Ctx.auth`：留给后端的那个座位

按 `ai: AiProvider` 的先例，往 `Ctx` 加一个只读字段：

```ts
export interface Identity {
  sub: string        // Google 用户唯一 ID，未来后端的主键就是它
  name: string
  email: string
  picture?: string   // 存下来但本期不渲染
}

export interface AuthStore {
  identity(): Identity | null
  /** 未来的后端客户端从这里取 Bearer。当前无人调用，故意留着。 */
  idToken(): string | null
  /** 传入 Google 返回的 credential（ID token JWT）。解析失败抛错，不写入。 */
  signIn(credential: string): Identity
  signOut(): void
}

export interface Ctx {
  // ...既有字段不变
  readonly auth: AuthStore
}
```

`idToken()` 是本设计对「为后端奠基」这个目标的全部兑现：将来加后端时，
`Authorization: Bearer ${ctx.auth.idToken()}`，服务端用 Google 公钥验签并校验 `aud` 等于
`client_id` 即可。本期**不写**任何调用方。

### `Host` 契约不变

一个字都不改。登录按钮是命令自己输出的 `node` chunk，由 `OutputBlock` 正常渲染，
不需要 UI 层开新的口子——这与 `enterChat` 那种「命令请求 UI 切换模式」是不同性质的事。

## 模块边界

| 文件 | 职责 | 依赖 |
|---|---|---|
| `src/core/auth/identity.ts` | `Identity` 类型；`decodeIdToken(jwt): Identity \| null` 纯函数 | 无 |
| `src/core/auth/store.ts` | `createAuthStore()`：内存持 idToken，localStorage 持 Identity | localStorage |
| `src/ui/auth/gis.ts` | 唯一接触 `window.google.accounts.id` 的适配层：懒注入脚本、initialize、renderButton | GIS 全局 |
| `src/ui/auth/SignInButton.tsx` | 挂载即渲染 Google 按钮，点击后回调 credential | React + gis.ts |
| `src/ui/commands/login.tsx` | `login` 命令（需构造 React 元素，故进 `uiCommands`） | 以上全部 |
| `src/commands/sys/logout.ts` | `logout` 命令（纯 TS，按仓库既有边界规则留在 `src/commands`） | `ctx.auth` |

`login` 与 `logout` 落在两个目录里，是因为仓库既有的边界规则是「**需要构造 React 元素的命令**
才进 `src/ui/commands`」（见 `src/ui/commands/index.ts` 的注释与
`src/commands` 的 no-restricted-imports 约束）。`logout` 不需要 React，就不该借这个口子。

### `decodeIdToken` 只解码，不验签

函数上会钉一条注释说明：它只 base64url 解 JWT 的 payload 段，**不做签名校验**。
展示态不需要验签，且前端验签本就没有安全意义（攻击者改的是自己的浏览器）。
写下这句是为了防止以后有人把它误当成安全边界。

真正的验签发生在未来的后端，用 `idToken()` 取到的原文。

## 数据流

1. **加载**：`createAuthStore()` 从 localStorage 恢复 `Identity`（**没有 token**——它从不落盘）
2. **kernel 初始化**：`USER = usernameOf(identity) ?? 'guest'`
3. **提示符自动跟随**：`kernel.ts:118` 本来就是 `${USER}@${HOSTNAME}:${cwd}$`，不用改
4. **开机欢迎语**：`Terminal.tsx` 的 `bootLines` 在 motd 之后追加一行 `Welcome back, <name>.`（走 i18n）。
   **不改 `/etc/motd`**——它模拟的是真实系统文件，塞动态问候会把它弄脏
5. **`login`**：输出一个 `node` chunk（一行提示 + `<SignInButton>`）→ await credential →
   `ctx.auth.signIn(jwt)` → `ctx.env.set('USER', …)` → 打印 `✓ Signed in as Xiaohan Cui <…@gmail.com>`
6. **`whoami`**：已登录输出 `Name <email>`，未登录维持原样输出 `$USER`
7. **`logout`**：`ctx.auth.signOut()`（内含 `google.accounts.id.disableAutoSelect()`，
   否则下次点按钮会静默重登）→ `USER` 回 `guest`

### 重复调用

- 已登录时再 `login`：**不重新走 Google 流程**，直接打印当前身份并退出码 0。
  想换账号就先 `logout`——这与「`logout` 会 `disableAutoSelect()`」是配套的，
  否则按钮一点就静默重登回同一个账号，看起来像换号失败。
- 未登录时 `logout`：打印「当前未登录」，退出码 0。它是幂等的，不是错误。

### `USER` 的取值规则

`Xiaohan Cui` → `xiaohan`：取姓名首段、转小写、只保留 `[a-z0-9]`。
邮箱 local-part（`mr.web0310`）当提示符太丑，不用。
若结果为空（例如纯中文姓名），落回 `user`——提示符里出现非 ASCII 会破坏终端观感与对齐。

`usernameOf` 与 `decodeIdToken` 同住 `identity.ts`：同样是纯函数，跟着一起被测。

## 失败与降级

对标 `languageModel.ts` 的四态降级，逐条列明：

| 情形 | 行为 |
|---|---|
| **GIS 脚本加载失败或超时（10s）** | 打印「Google 登录服务不可用」，退出码 1 |
| 用户关闭弹窗 / 取消 | 打印已取消，退出码 1 |
| `Ctrl+C`（`ctx.signal` abort） | 中止等待，退出码 130，按钮失效 |
| JWT 畸形或缺 `sub`/`name`/`email` | 视为登录失败，**不写 store**，退出码 1 |
| localStorage 不可用（无痕模式） | try/catch 吞掉，登录在**本次会话内**照常有效 |

**超时那条是必须的，不是防御性编程。** `accounts.google.com` 在中国大陆不可达，
而这个站点是中英双语、面向相当比例的中文访客。没有超时，`login` 会永远转圈——
这是最容易发生、也最难堪的失败模式。

**身份不设过期**，只有 `logout` 会清。它只是展示态（token 早就不在了），给它加过期是自找复杂。

## 配置

- `client_id` 走 `VITE_GOOGLE_CLIENT_ID`，`.github/workflows/deploy.yml` 注入。
  client_id 本身是公开信息，走 env 只为好换；缺失时 `login` 打印明确错误而非静默失败。
- GIS 脚本**运行时注入 `<script>`**，不进 bundle——保持零运行时依赖。
- **`client_secret` 不进仓库，本设计完全用不到。** 该 secret 已在设计讨论中明文出现过，
  建议在 Google Cloud Console 中 rotate。

## 测试策略

刻意收窄到两条新测试，外加一条白拿的：

1. **`decodeIdToken` 纯函数**：正常 JWT → `Identity`；畸形 / 缺字段 → `null`。
   纯 TS 无依赖，是这批代码里最值得钉住的部分。
2. **`login` / `logout` 命令**：用 `testkit` 配一个假 `AuthStore` 跑通全链——
   登录后 `whoami` 与 `$USER` 变了，`logout` 后回 `guest`。
3. **`i18nCoverage`（已存在）**：它会自动逼着把 `login` / `logout` 的中英
   `description` + `usage` 补进 `commandMeta.ts`，不用新写。

**不测** `gis.ts` 与 `SignInButton`：要 mock `window.google` 全局，成本高、收益低，
且它们的行为最终取决于 Google 的 iframe，测了也不代表线上对。

## 收尾清单

- `src/i18n/commandMeta.ts`：`login` / `logout` 的中英 `description` + `usage`（不补会红）
- `src/i18n/messages.ts`：登录提示、成功、取消、服务不可用、欢迎回来
- `src/commands/testkit.ts`：注入假 `AuthStore`（`Ctx` 加了字段，不补会编译失败）
- `README.md` / `README.en.md`：双向补一节。仓库刚做完双语对齐，别破坏它
