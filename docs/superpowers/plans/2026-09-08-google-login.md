# Google 登录实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给终端站加 `login` / `logout` 两个命令，用 Google 账号登录后提示符、`whoami`、开机欢迎语都「认得」访客，并留下未来接后端 API 所需的 ID token 座位。

**Architecture:** 纯前端。`google.accounts.id` + 内联官方按钮拿到 **ID token（JWT）**，前端只解码 payload 取姓名邮箱做展示，token 只存内存、身份存 localStorage。适配层照抄 `src/core/ai/languageModel.ts` 的形状：唯一接触浏览器全局的模块 + 纯接口给命令用。`Ctx` 新增 `auth: AuthStore`，其中 `idToken()` 是留给未来后端的座位，本期无人调用。

**Tech Stack:** TypeScript 5.9（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、React 19、Vite 8、Vitest 4、pnpm。**不新增任何 npm 依赖**——GIS 脚本运行时注入 `<script>`。

**Spec:** `docs/superpowers/specs/2026-09-08-google-login-design.md`

## Global Constraints

- **零新增运行时依赖。** `package.json` 的 `dependencies` 必须保持只有 `react` / `react-dom`。GIS 走运行时 `<script>` 注入，不打包。
- **架构边界由 ESLint 机械强制**（`eslint.config.js`）：`src/core/**` 与 `src/commands/**` 只允许 `import type` 形式引用 react，写不了 JSX。新代码必须守住这条线。
- **Vitest 默认环境是 `node`，不是 jsdom**（见 `vitest.config.ts` 顶部注释）。需要 DOM 的测试文件自己 `import '<相对路径>/ui/test-setup'`。本计划新增的两个测试文件**都跑在纯 node 下**，不许引入 test-setup。
- **`localStorage` 在 node 环境下不存在**，访问会抛 `ReferenceError`。所有读写必须包 try/catch（仓库既有约定，见 `src/ui/useLang.ts:18` 与 `src/ui/BootSequence.tsx:8`）。
- **i18n 覆盖是硬门禁**：`src/ui/commands/i18nCoverage.test.tsx` 会枚举全部非 hidden 命令，`login` / `logout` 的中英 `description` **和** `usage` 少一个就红。
- **`client_secret` 绝不进仓库。** 本方案完全用不到它。`client_id` 走 `VITE_GOOGLE_CLIENT_ID`。
- **`decodeIdToken` 不是安全边界**，注释必须写明这一点。
- 提交信息用中文，与仓库既有风格一致。

## 对 spec 的两处偏离（已在计划中采纳）

### 一、login 的落点

Spec 的模块表把 `login` 放在 `src/ui/commands/login.tsx`。本计划改为：

- `src/commands/sys/login.ts` —— 纯 TS 的 `createLogin(requestCredential)` 工厂，承载全部登录**逻辑**
- `src/ui/auth/buttonCredential.tsx` —— 唯一的 React 部分：输出按钮 node chunk 并等待 credential

**原因是可测性。** 若 `login` 自己构造 React 元素，单测里那个按钮永远不会被渲染，命令会永远 await——测不了。把「怎么拿到 credential」抽成注入的 `CredentialSource`，`login` 就能在纯 node 下用一个 `async () => FAKE_JWT` 跑通全链，正好兑现 spec「测试策略」里那条。命令仍然经 `uiCommands` 注册（它需要 UI 侧接线），spec 其余部分不变。

### 二、「用户关闭弹窗 → 打印已取消，退出码 1」这条降级做不到

Spec 的失败降级表里有这一行，但 `renderButton` 这条路径上**没有任何取消信号**：用户把 Google 弹窗关掉，GIS 只是不回调，不通知宿主页面。

因此实际行为是：**按钮留在原地，用户可以再点一次，或者按 Ctrl+C 退出（退 130）**。这比编一个猜测式的超时判定更诚实——超时会把「在弹窗里慢慢选账号」误判成取消。`AUTH_TEXT` 里相应地没有 `cancelled` 文案。

Spec 那一行应理解为已被这条取代。

## File Structure

**新建**

| 文件 | 职责 |
|---|---|
| `src/core/auth/identity.ts` | `Identity` 类型；`asIdentity` / `decodeIdToken` / `usernameOf` 三个纯函数 |
| `src/core/auth/identity.test.ts` | 上面三个函数的单测（纯 node） |
| `src/core/auth/store.ts` | `createAuthStore()`：内存持 idToken，localStorage 持 Identity |
| `src/commands/sys/login.ts` | `createLogin(requestCredential)` 工厂 + `CredentialSource` 类型 |
| `src/commands/sys/logout.ts` | `logout` 命令 |
| `src/commands/sys/auth.test.ts` | `login` / `logout` / `whoami` 三者联动的单测（纯 node） |
| `src/ui/auth/gis.ts` | 唯一接触 `window.google.accounts.id` 的适配层 + `browserGis` 单例 |
| `src/ui/auth/SignInButton.tsx` | 挂载即渲染 Google 按钮的组件 |
| `src/ui/auth/buttonCredential.tsx` | 真实的 `CredentialSource`：写 node chunk 并等待 |

**修改**

| 文件 | 改动 |
|---|---|
| `src/core/process.ts` | `Ctx` 加 `readonly auth: AuthStore` |
| `src/core/kernel.ts` | `createKernel` 接受可选 `auth`，塞进 `makeCtx` |
| `src/commands/testkit.ts` | `makeTestCtx` 补 `auth` 字段 |
| `src/commands/sys/whoami.ts` | 已登录时输出 `Name <email>` |
| `src/commands/index.ts` | 注册 `logout` |
| `src/ui/commands/index.ts` | 注册 `createLogin(buttonCredential)` |
| `src/i18n/messages.ts` | 新增 `AUTH_TEXT` |
| `src/i18n/commandMeta.ts` | `login` / `logout` 的中英 description + usage |
| `src/ui/useTerminal.ts` | 建 auth store、传进 kernel、恢复 `USER`、导出 `bootIdentity` |
| `src/ui/Terminal.tsx` | 开机欢迎语追加一行 |
| `.github/workflows/deploy.yml` | 构建注入 `VITE_GOOGLE_CLIENT_ID` |
| `README.md` / `README.en.md` | 双向补一节 |

---

### Task 1: Identity 纯函数

**Files:**
- Create: `src/core/auth/identity.ts`
- Test: `src/core/auth/identity.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `interface Identity { sub: string; name: string; email: string; picture?: string }`
  - `function asIdentity(raw: unknown): Identity | null`
  - `function decodeIdToken(jwt: string): Identity | null`
  - `function usernameOf(identity: Identity): string`

- [ ] **Step 1: 写失败的测试**

创建 `src/core/auth/identity.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { decodeIdToken, usernameOf } from './identity'

/** 造一个形状真实、但签名是假的 JWT —— 被测函数本来就不验签。 */
function makeJwt(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `eyJhbGciOiJSUzI1NiJ9.${b64}.fake-signature`
}

const FULL = { sub: '1234567890', name: 'Xiaohan Cui', email: 'mr.web0310@gmail.com', picture: 'https://x/y.png' }

describe('decodeIdToken', () => {
  it('解出 sub / name / email / picture', () => {
    expect(decodeIdToken(makeJwt(FULL))).toEqual(FULL)
  })

  it('picture 缺失时不落一个 undefined 字段 —— 它会被 JSON.stringify 原样写进 localStorage', () => {
    const noPicture = { sub: FULL.sub, name: FULL.name, email: FULL.email }
    const got = decodeIdToken(makeJwt(noPicture))
    expect(got).toEqual(noPicture)
    expect(got !== null && 'picture' in got).toBe(false)
  })

  it('UTF-8 姓名不乱码 —— atob 出来的是字节不是字符', () => {
    expect(decodeIdToken(makeJwt({ ...FULL, name: '崔小涵' }))?.name).toBe('崔小涵')
  })

  // 下面每一条都对应一种线上真会遇到的坏输入。任何一条返回了对象而不是 null，
  // 都会让一个残缺身份被写进 localStorage 并长期驻留。
  it.each([
    ['空串', ''],
    ['不是 JWT', 'not-a-jwt'],
    ['只有 header', 'eyJhbGciOiJSUzI1NiJ9'],
    ['payload 不是合法 base64url', 'a.@@@@.c'],
    ['payload 不是 JSON', `a.${btoa('plain text').replace(/=+$/, '')}.c`],
  ])('%s → null', (_label, jwt) => {
    expect(decodeIdToken(jwt)).toBeNull()
  })

  it.each([
    ['缺 sub', { name: 'A', email: 'a@b.c' }],
    ['缺 name', { sub: '1', email: 'a@b.c' }],
    ['缺 email', { sub: '1', name: 'A' }],
    ['sub 是数字不是字符串', { sub: 1, name: 'A', email: 'a@b.c' }],
    ['name 是空串', { sub: '1', name: '', email: 'a@b.c' }],
  ])('%s → null', (_label, payload) => {
    expect(decodeIdToken(makeJwt(payload as Record<string, unknown>))).toBeNull()
  })

  // 单独一条而不是并进上面的 it.each：数组进不了那张表的元组类型，
  // 硬断言成 Record 会被 TS 判成可疑转换。
  it('payload 是数组 → null', () => {
    expect(decodeIdToken(`eyJhbGciOiJSUzI1NiJ9.${btoa('[]')}.fake-signature`)).toBeNull()
  })
})

describe('usernameOf', () => {
  it.each([
    ['Xiaohan Cui', 'xiaohan'],
    ['xiaohan', 'xiaohan'],
    ['Mary-Jane Watson', 'maryjane'],
    ['  Ada   Lovelace  ', 'ada'],
    ['R2D2 Unit', 'r2d2'],
  ])('%s → %s', (name, want) => {
    expect(usernameOf({ sub: '1', name, email: 'a@b.c' })).toBe(want)
  })

  // 提示符里出现非 ASCII 会破坏终端观感与对齐，落回一个稳妥的默认值。
  it.each(['崔小涵', '...', ''])('无 ASCII 可用时落回 user：%s', (name) => {
    expect(usernameOf({ sub: '1', name, email: 'a@b.c' })).toBe('user')
  })
})
```

- [ ] **Step 2: 运行测试确认它失败**

Run: `pnpm vitest run src/core/auth/identity.test.ts`
Expected: FAIL，报 `Failed to resolve import "./identity"`

- [ ] **Step 3: 写实现**

创建 `src/core/auth/identity.ts`：

```ts
/**
 * Google 身份的最小形状。picture 存下来但当前不渲染 ——
 * 终端里画图片是另一个量级的工作，见设计文档的「非目标」。
 */
export interface Identity {
  sub: string        // Google 用户唯一 ID，未来后端的主键就是它
  name: string
  email: string
  picture?: string
}

/**
 * 把任意来源的未知值收窄成 Identity。两个调用方共用它：
 * decodeIdToken（来自 Google）与 store 的 localStorage 读取（来自上一次会话，
 * 用户可以手改）。两边都不可信，所以校验只写一份。
 */
export function asIdentity(raw: unknown): Identity | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const { sub, name, email, picture } = o
  if (typeof sub !== 'string' || sub === '') return null
  if (typeof name !== 'string' || name === '') return null
  if (typeof email !== 'string' || email === '') return null
  // 条件展开而不是 `picture: picture as string | undefined`：后者会留下一个值为
  // undefined 的字段，JSON.stringify 时消失、toEqual 时又碍事，形状不干净。
  return typeof picture === 'string' && picture !== ''
    ? { sub, name, email, picture }
    : { sub, name, email }
}

/**
 * 解码 Google 返回的 ID token，取出身份用于展示。
 *
 * **只解 payload，不做签名校验，不是安全边界。** 展示态不需要验签，
 * 前端验签也没有安全意义 —— 攻击者改的是他自己的浏览器。真正的验签发生在
 * 未来的后端：用 AuthStore.idToken() 取到 JWT 原文，服务端拿 Google 公钥
 * 验签并校验 aud 等于 client_id。不要把这个函数当成那一步。
 */
export function decodeIdToken(jwt: string): Identity | null {
  const payload = jwt.split('.')[1]
  if (payload === undefined || payload === '') return null
  try {
    // base64url → base64，并补回 atob 需要的 padding
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    // 不能直接 JSON.parse(atob(...))：atob 返回的是每字符一字节的二进制串，
    // 非 ASCII 姓名（中文、带音标的拉丁字母）会当场乱码。必须按 UTF-8 解。
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
    return asIdentity(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null   // 非法 base64 / 非 JSON / 任何解析异常，一律当作没拿到身份
  }
}

/**
 * 姓名 → shell 用户名。取首段、转小写、只留 [a-z0-9]。
 * 邮箱 local-part（mr.web0310）当提示符太丑，不用它。
 * 结果为空（纯中文姓名等）落回 'user'：提示符里出现非 ASCII 会破坏对齐。
 */
export function usernameOf(identity: Identity): string {
  const first = identity.name.trim().split(/\s+/)[0] ?? ''
  const cleaned = first.toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned === '' ? 'user' : cleaned
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/core/auth/identity.test.ts`
Expected: PASS，全部用例绿

- [ ] **Step 5: 跑 lint 与类型检查**

Run: `pnpm lint && pnpm exec tsc -b --force`
Expected: 无输出（无错误）

- [ ] **Step 6: 提交**

```bash
git add src/core/auth/identity.ts src/core/auth/identity.test.ts
git commit -m "feat(auth): Identity 类型与 ID token 解码

只解 JWT payload、不验签 —— 展示态不需要，前端验签也没有安全意义。
按 UTF-8 解码而不是直接 JSON.parse(atob())：后者会让中文姓名乱码。
坏输入一律 null，避免残缺身份被写进 localStorage 长期驻留。"
```

---

### Task 2: AuthStore 与 Ctx.auth 接线

**Files:**
- Create: `src/core/auth/store.ts`
- Modify: `src/core/process.ts`（`Ctx` 接口）、`src/core/kernel.ts`、`src/commands/testkit.ts`
- Test: 无新测试。本任务的验收是**既有全套测试与类型检查仍然绿** —— 给 `Ctx` 加必填字段会让每一处构造 `Ctx` 的地方编译失败，这本身就是门禁。

**Interfaces:**
- Consumes: Task 1 的 `Identity` / `asIdentity` / `decodeIdToken`
- Produces:
  - `const AUTH_STORAGE_KEY = 'terminal-identity'`
  - `interface AuthStore { identity(): Identity | null; idToken(): string | null; signIn(credential: string): Identity; signOut(): void }`
  - `function createAuthStore(opts?: { onSignOut?: () => void }): AuthStore`
  - `Ctx` 新增 `readonly auth: AuthStore`
  - `createKernel` 新增可选参数 `auth?: AuthStore`

- [ ] **Step 1: 写 store**

创建 `src/core/auth/store.ts`：

```ts
import { asIdentity, decodeIdToken, type Identity } from './identity'

export const AUTH_STORAGE_KEY = 'terminal-identity'

export interface AuthStore {
  identity(): Identity | null
  /**
   * ID token 原文。**当前没有任何调用方，这是故意的** —— 它是留给未来后端的座位：
   * `Authorization: Bearer ${ctx.auth.idToken()}`，服务端用 Google 公钥验签并校验
   * aud 等于 client_id。见设计文档「Ctx.auth：留给后端的那个座位」。
   */
  idToken(): string | null
  /** 传入 Google 返回的 credential（ID token JWT）。解析失败抛错，且不写入任何状态。 */
  signIn(credential: string): Identity
  signOut(): void
}

/** 读一次上次会话存下的身份。整个函数不许抛 —— 它跑在内核构造路径上。 */
function readStored(): Identity | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw === null) return null
    // 存档是用户可以手改的，跟 Google 来的数据一样不可信，走同一套收窄。
    return asIdentity(JSON.parse(raw))
  } catch {
    // 三种情况共用这一条路：隐私模式下 localStorage 抛异常、
    // node 环境下它压根不存在（ReferenceError）、存档不是合法 JSON。
    return null
  }
}

/**
 * 身份持久、凭证不落盘：Identity 进 localStorage，ID token 只活在这个闭包里。
 * 刷新页面后终端仍然「认得你」，但 token 没了 —— 未来需要它的那一刻再静默续。
 *
 * onSignOut 是留给 UI 层的钩子：登出时要调 GIS 的 disableAutoSelect()，
 * 而那是浏览器全局，core 不能碰。
 */
export function createAuthStore(opts: { onSignOut?: () => void } = {}): AuthStore {
  let identity = readStored()
  let token: string | null = null

  return {
    identity: () => identity,
    idToken: () => token,

    signIn(credential) {
      const parsed = decodeIdToken(credential)
      if (parsed === null) throw new Error('invalid credential')
      identity = parsed
      token = credential
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed))
      } catch { /* 无痕模式写不进去：登录在本次会话内照常有效 */ }
      return parsed
    },

    signOut() {
      identity = null
      token = null
      try { localStorage.removeItem(AUTH_STORAGE_KEY) } catch { /* 同上 */ }
      opts.onSignOut?.()
    },
  }
}
```

- [ ] **Step 2: 把 auth 放进 Ctx**

修改 `src/core/process.ts`。在文件顶部的 import 区加：

```ts
import type { AuthStore } from './auth/store'
```

在 `export interface Ctx` 里，`readonly ai: AiProvider` 那一行下面加：

```ts
  readonly auth: AuthStore      // 登录态。idToken() 是留给未来后端的座位
```

- [ ] **Step 3: 内核接线**

修改 `src/core/kernel.ts`：

顶部 import 区加：

```ts
import { createAuthStore, type AuthStore } from './auth/store'
```

`createKernel` 的参数对象里，`ai?: AiProvider` 那一行下面加：

```ts
  auth?: AuthStore             // 默认自建（读 localStorage）；UI 与测试可注入
```

函数体开头 `const ai = opts.ai ?? createBrowserAi()` 下面加：

```ts
  const auth = opts.auth ?? createAuthStore()
```

`makeCtx` 返回的对象里，`ai,` 那一行下面加：

```ts
      auth,
```

- [ ] **Step 4: 补 testkit**

修改 `src/commands/testkit.ts`：

顶部 import 区加：

```ts
import { createAuthStore } from '../core/auth/store'
```

`makeTestCtx` 返回的对象里，`ai: fakeAi({ kind: 'unsupported' }),` 那一行下面加：

```ts
    // 用真 store 而不是替身：它在 node 环境下会因为没有 localStorage 而
    // 静默退化成「不持久」，逻辑本身照跑 —— 造一个替身只会多一份要维护的形状。
    auth: createAuthStore(),
```

- [ ] **Step 5: 全量验证**

Run: `pnpm lint && pnpm exec tsc -b --force && pnpm test`
Expected: 三条全过。若 `tsc` 报某处 `Ctx` 缺 `auth`，说明还有构造 `Ctx` 的地方没补——按同样方式补上 `auth: createAuthStore()`。

- [ ] **Step 6: 提交**

```bash
git add src/core/auth/store.ts src/core/process.ts src/core/kernel.ts src/commands/testkit.ts
git commit -m "feat(auth): AuthStore 与 Ctx.auth

身份持久、凭证不落盘：Identity 进 localStorage，ID token 只活在闭包里。
localStorage 全部包 try/catch —— 隐私模式会抛，node 测试环境下它压根不存在。

idToken() 当前无人调用，是留给未来后端的座位：后端拿 Google 公钥验签
JWT 原文并校验 aud，这是 ID token 而非 access_token 方案的全部意义。"
```

---

### Task 3: login / logout / whoami 三个命令

**Files:**
- Create: `src/commands/sys/login.ts`、`src/commands/sys/logout.ts`
- Modify: `src/commands/sys/whoami.ts`、`src/commands/index.ts`、`src/i18n/messages.ts`、`src/i18n/commandMeta.ts`
- Test: `src/commands/sys/auth.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `usernameOf`；Task 2 的 `Ctx.auth`
- Produces:
  - `type CredentialSource = (io: IO, ctx: Ctx) => Promise<string>`
  - `function createLogin(requestCredential: CredentialSource): Process`
  - `const logout: Process`
  - `const AUTH_TEXT: Record<Lang, AuthText>`（`src/i18n/messages.ts`）

- [ ] **Step 1: 写失败的测试**

创建 `src/commands/sys/auth.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestCtx, runCmd } from '../testkit'
import { createLogin } from './login'
import { logout } from './logout'
import { whoami } from './whoami'
import type { Ctx } from '../../core/process'

function makeJwt(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `eyJhbGciOiJSUzI1NiJ9.${b64}.fake-signature`
}

const JWT = makeJwt({ sub: '1', name: 'Xiaohan Cui', email: 'mr.web0310@gmail.com' })

/** 替掉「怎么拿到 credential」这一步 —— 真实实现要弹 Google 的窗，单测里弹不了。 */
const grants = (jwt: string) => createLogin(async () => jwt)
const rejects = (message: string) => createLogin(async () => { throw new Error(message) })

let ctx: Ctx
beforeEach(() => { ctx = makeTestCtx() })

describe('login', () => {
  it('登录成功后写入身份、改 USER、并回显姓名与邮箱', async () => {
    const r = await runCmd(grants(JWT), ['login'], ctx)
    expect(r.code).toBe(0)
    expect(r.out).toContain('Xiaohan Cui')
    expect(r.out).toContain('mr.web0310@gmail.com')
    expect(ctx.auth.identity()?.sub).toBe('1')
    expect(ctx.env.get('USER')).toBe('xiaohan')
  })

  it('token 原文留在 store 里 —— 未来后端要的就是它', async () => {
    await runCmd(grants(JWT), ['login'], ctx)
    expect(ctx.auth.idToken()).toBe(JWT)
  })

  it('已登录时再 login 不重走流程，直接回显当前身份', async () => {
    await runCmd(grants(JWT), ['login'], ctx)
    // 换一个必定抛错的 source：它一旦被调用，这条用例就会以非 0 退出码失败，
    // 「没有重走流程」因此是被真正断言的，而不是只看输出文本猜的。
    const r = await runCmd(rejects('不该被调用'), ['login'], ctx)
    expect(r.code).toBe(0)
    expect(r.out).toContain('Xiaohan Cui')
  })

  it('credential 拿不到时退 1，且不写入任何状态', async () => {
    const r = await runCmd(rejects('Google 登录服务不可用'), ['login'], ctx)
    expect(r.code).toBe(1)
    expect(r.err).toContain('Google 登录服务不可用')
    expect(ctx.auth.identity()).toBeNull()
    expect(ctx.env.get('USER')).toBe('guest')
  })

  it('Ctrl+C 中断时退 130 而不是 1 —— 用户主动取消不是错误', async () => {
    const aborter = new AbortController()
    const aborted: Ctx = { ...ctx, signal: aborter.signal }
    aborter.abort()
    const r = await runCmd(createLogin(async () => { throw new Error('aborted') }), ['login'], aborted)
    expect(r.code).toBe(130)
  })

  it('credential 畸形时退 1，不写入残缺身份', async () => {
    const r = await runCmd(grants('not-a-jwt'), ['login'], ctx)
    expect(r.code).toBe(1)
    expect(ctx.auth.identity()).toBeNull()
    expect(ctx.env.get('USER')).toBe('guest')
  })
})

describe('logout', () => {
  it('登出后身份清空、USER 回 guest', async () => {
    await runCmd(grants(JWT), ['login'], ctx)
    const r = await runCmd(logout, ['logout'], ctx)
    expect(r.code).toBe(0)
    expect(ctx.auth.identity()).toBeNull()
    expect(ctx.auth.idToken()).toBeNull()
    expect(ctx.env.get('USER')).toBe('guest')
  })

  it('未登录时是幂等的，不是错误', async () => {
    const r = await runCmd(logout, ['logout'], ctx)
    expect(r.code).toBe(0)
  })
})

describe('whoami', () => {
  it('未登录时维持原样输出 $USER', async () => {
    expect((await runCmd(whoami, ['whoami'], ctx)).out).toBe('guest\n')
  })

  it('已登录时输出姓名与邮箱', async () => {
    await runCmd(grants(JWT), ['login'], ctx)
    expect((await runCmd(whoami, ['whoami'], ctx)).out).toBe('Xiaohan Cui <mr.web0310@gmail.com>\n')
  })

  it('logout 之后回到 guest', async () => {
    await runCmd(grants(JWT), ['login'], ctx)
    await runCmd(logout, ['logout'], ctx)
    expect((await runCmd(whoami, ['whoami'], ctx)).out).toBe('guest\n')
  })
})
```

- [ ] **Step 2: 运行测试确认它失败**

Run: `pnpm vitest run src/commands/sys/auth.test.ts`
Expected: FAIL，报 `Failed to resolve import "./login"`

- [ ] **Step 3: 加 i18n 文案**

修改 `src/i18n/messages.ts`，在文件末尾追加：

```ts
export interface AuthText {
  /** 按钮上方那行提示 */
  prompt: string
  already(name: string, email: string): string
  signedIn(name: string, email: string): string
  signedOut: string
  notSignedIn: string
  badCredential: string
  /** GIS 脚本加载失败或超时。中国大陆访问不到 accounts.google.com，这条不是摆设。 */
  unavailable: string
  missingClientId: string
  welcomeBack(name: string): string
}

export const AUTH_TEXT: Record<Lang, AuthText> = {
  en: {
    prompt: 'Sign in with your Google account:',
    already: (name, email) => `Already signed in as ${name} <${email}>. Run 'logout' first to switch accounts.`,
    signedIn: (name, email) => `Signed in as ${name} <${email}>`,
    signedOut: 'Signed out.',
    notSignedIn: 'Not signed in.',
    badCredential: 'login: the credential returned by Google could not be read.',
    unavailable: "login: Google's sign-in service is unreachable. Check your network and try again.",
    missingClientId: 'login: VITE_GOOGLE_CLIENT_ID is not configured for this build.',
    welcomeBack: (name) => `Welcome back, ${name}.`,
  },
  zh: {
    prompt: '用 Google 账号登录：',
    already: (name, email) => `已经登录为 ${name} <${email}>。要换账号请先执行 logout。`,
    signedIn: (name, email) => `已登录：${name} <${email}>`,
    signedOut: '已退出登录。',
    notSignedIn: '当前未登录。',
    badCredential: 'login: 无法读取 Google 返回的凭证。',
    unavailable: 'login: 连不上 Google 登录服务，请检查网络后重试。',
    missingClientId: 'login: 这次构建没有配置 VITE_GOOGLE_CLIENT_ID。',
    welcomeBack: (name) => `欢迎回来，${name}。`,
  },
}
```

- [ ] **Step 4: 写 login**

创建 `src/commands/sys/login.ts`：

```ts
import { usernameOf } from '../../core/auth/identity'
import { AUTH_TEXT } from '../../i18n/messages'
import type { Ctx, IO, Process } from '../../core/process'

/**
 * 「怎么拿到 credential」这一步被注入进来，而不是写死在命令里。
 * 真实实现要往输出块里渲染 Google 的官方按钮并等待点击（见
 * src/ui/auth/buttonCredential.tsx），那是 React + 浏览器全局，
 * 既不能出现在这个纯 TS 层，单测里也永远不会被渲染 —— 命令会永远 await。
 * 抽成这个接口之后，登录逻辑可以在纯 node 下用 `async () => JWT` 跑通全链。
 */
export type CredentialSource = (io: IO, ctx: Ctx) => Promise<string>

export function createLogin(requestCredential: CredentialSource): Process {
  return {
    name: 'login',
    description: '用 Google 账号登录',
    usage: 'login',

    async run(io, ctx) {
      const t = AUTH_TEXT[ctx.host.currentLang()]

      // 已登录就直接回显，不重走 Google 流程。要换账号得先 logout ——
      // 这跟 logout 会调 disableAutoSelect() 是配套的：否则按钮一点就
      // 静默重登回同一个账号，看起来像换号失败。
      const current = ctx.auth.identity()
      if (current !== null) {
        io.stdout.writeLine(t.already(current.name, current.email))
        return 0
      }

      let credential: string
      try {
        credential = await requestCredential(io, ctx)
      } catch (e) {
        // Ctrl+C 不是错误，按 shell 惯例退 130 且不打印红字
        if (ctx.signal.aborted) return 130
        io.stderr.writeLine(e instanceof Error ? e.message : String(e), { color: 'red' })
        return 1
      }

      try {
        const identity = ctx.auth.signIn(credential)
        ctx.env.set('USER', usernameOf(identity))
        io.stdout.writeLine(t.signedIn(identity.name, identity.email), { color: 'green' })
        return 0
      } catch {
        // signIn 解析失败时不写入任何状态，USER 也不动
        io.stderr.writeLine(t.badCredential, { color: 'red' })
        return 1
      }
    },
  }
}
```

- [ ] **Step 5: 写 logout**

创建 `src/commands/sys/logout.ts`：

```ts
import { AUTH_TEXT } from '../../i18n/messages'
import type { Process } from '../../core/process'

export const logout: Process = {
  name: 'logout',
  description: '退出登录',
  usage: 'logout',

  async run(io, ctx) {
    const t = AUTH_TEXT[ctx.host.currentLang()]

    // 未登录时是幂等的，不是错误 —— 真实 shell 里 logout 也不会因此报错
    if (ctx.auth.identity() === null) {
      io.stdout.writeLine(t.notSignedIn)
      return 0
    }

    ctx.auth.signOut()
    ctx.env.set('USER', 'guest')
    io.stdout.writeLine(t.signedOut)
    return 0
  },
}
```

- [ ] **Step 6: 改 whoami**

把 `src/commands/sys/whoami.ts` 整个替换成：

```ts
import type { Process } from '../../core/process'

export const whoami: Process = {
  name: 'whoami',
  description: '显示当前用户',
  usage: 'whoami',
  async run(io, ctx) {
    // 已登录时给完整身份；未登录仍然读 $USER，保持它作为真 shell 的行为
    const id = ctx.auth.identity()
    io.stdout.writeLine(id === null ? ctx.env.get('USER') ?? 'guest' : `${id.name} <${id.email}>`)
    return 0
  },
}
```

- [ ] **Step 7: 注册 logout**

修改 `src/commands/index.ts`：

在 `import { whoami } from './sys/whoami'` 下面加：

```ts
import { logout } from './sys/logout'
```

把 `builtins` 数组里这一行：

```ts
  help, man, whoami, uname, date, env, exportCmd, which, history, clear, theme, lang,
```

改成：

```ts
  help, man, whoami, uname, date, env, exportCmd, which, history, clear, theme, lang, logout,
```

（`login` 不在这里注册 —— 它需要 UI 侧的 credential source，见 Task 4。）

- [ ] **Step 8: 补翻译表**

修改 `src/i18n/commandMeta.ts`。在 `en` 块里 `lang:` 那一行下面加：

```ts
    login: { description: 'Sign in with your Google account', usage: 'login' },
    logout: { description: 'Sign out', usage: 'logout' },
```

在 `zh` 块里对应的 `lang:` 那一行下面加：

```ts
    login: { description: '用 Google 账号登录', usage: 'login' },
    logout: { description: '退出登录', usage: 'logout' },
```

- [ ] **Step 9: 运行测试确认通过**

Run: `pnpm vitest run src/commands/sys/auth.test.ts`
Expected: PASS，全部用例绿

- [ ] **Step 10: 全量验证**

Run: `pnpm lint && pnpm exec tsc -b --force && pnpm test`
Expected: 全绿。特别确认 `src/ui/commands/i18nCoverage.test.tsx` 的两条是过的 —— 此刻 `logout` 已注册进 `builtins`，它的中英 description + usage 必须都在表里。

- [ ] **Step 11: 提交**

```bash
git add src/commands/sys/login.ts src/commands/sys/logout.ts src/commands/sys/whoami.ts \
        src/commands/sys/auth.test.ts src/commands/index.ts \
        src/i18n/messages.ts src/i18n/commandMeta.ts
git commit -m "feat(auth): login / logout 命令与 whoami 改造

login 把「怎么拿到 credential」抽成注入的 CredentialSource：真实实现要渲染
Google 官方按钮并等点击，单测里那个按钮永远不会被渲染、命令会永远 await。
抽出来之后登录逻辑可以在纯 node 下跑通全链。

已登录时再 login 直接回显、不重走流程；未登录时 logout 幂等返回 0。
Ctrl+C 退 130 而非 1 —— 用户主动取消不是错误。"
```

---

### Task 4: GIS 适配层、按钮与命令注册

**Files:**
- Create: `src/ui/auth/gis.ts`、`src/ui/auth/SignInButton.tsx`、`src/ui/auth/buttonCredential.tsx`
- Modify: `src/ui/commands/index.ts`、`.github/workflows/deploy.yml`
- Test: 无新测试（见下方说明）

**Interfaces:**
- Consumes: Task 3 的 `createLogin` 与 `CredentialSource`；`AUTH_TEXT`
- Produces:
  - `interface Gis { renderButton(el, opts): Promise<void>; disableAutoSelect(): void }`
  - `function createGis(clientId: string): Gis`
  - `const GOOGLE_CLIENT_ID: string`、`const browserGis: Gis`
  - `function buttonCredential(io: IO, ctx: Ctx): Promise<string>`

**为什么这一任务不写测试：** 这三个文件的全部行为都取决于 Google 的 iframe 与真实脚本加载，要测就得 mock `window.google` 全局——成本高，且测过了也不代表线上对。设计文档「测试策略」已明确把它们排除。它们的验收是 Task 6 的手动冒烟。

- [ ] **Step 1: 写 GIS 适配层**

创建 `src/ui/auth/gis.ts`：

```ts
/**
 * Google Identity Services 的适配层。整个代码库里唯一接触
 * `window.google.accounts.id` 的地方 —— 命令只依赖注入进来的 CredentialSource，
 * 因此可以脱离浏览器单测。形状照抄 core/ai/languageModel.ts。
 *
 * 脚本是运行时注入的，不打包：仓库的运行时依赖要保持只有 react / react-dom。
 */

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

/**
 * 加载超时。这不是防御性编程 —— accounts.google.com 在中国大陆不可达，
 * 而这个站点是中英双语、面向相当比例的中文访客。没有它，login 会永远转圈，
 * 这是最容易发生也最难堪的失败模式。
 */
const LOAD_TIMEOUT_MS = 10_000

type GoogleId = {
  initialize(opts: { client_id: string; callback: (r: { credential?: string }) => void }): void
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void
  disableAutoSelect(): void
}

function getGlobal(): GoogleId | undefined {
  return (globalThis as { google?: { accounts?: { id?: GoogleId } } }).google?.accounts?.id
}

export interface Gis {
  /** 把官方按钮渲染进 el；用户完成登录后用 ID token 调 onCredential。 */
  renderButton(el: HTMLElement, opts: { onCredential(jwt: string): void }): Promise<void>
  /** 登出时调，避免下次一点按钮就静默重登回同一个账号。脚本没加载时是空操作。 */
  disableAutoSelect(): void
}

export function createGis(clientId: string): Gis {
  let ready: Promise<GoogleId> | null = null
  // GIS 的 callback 是 initialize 时一次性登记的全局回调，而按钮可能被渲染多次，
  // 所以这里存一个可变的当前接收者，而不是每次 renderButton 都重新 initialize。
  let pending: ((jwt: string) => void) | null = null

  const ensure = (): Promise<GoogleId> => {
    if (ready !== null) return ready

    ready = new Promise<GoogleId>((resolve, reject) => {
      const existing = getGlobal()
      if (existing !== undefined) { resolve(existing); return }

      const el = document.createElement('script')
      el.src = SCRIPT_SRC
      el.async = true
      const timer = setTimeout(() => reject(new Error('gis: load timed out')), LOAD_TIMEOUT_MS)
      el.onload = () => {
        clearTimeout(timer)
        const api = getGlobal()
        // 脚本加载成功但全局形状不对：当作不可用，别让访客看到一个炸掉的命令
        if (api === undefined) { reject(new Error('gis: unexpected global shape')); return }
        resolve(api)
      }
      el.onerror = () => { clearTimeout(timer); reject(new Error('gis: script unreachable')) }
      document.head.appendChild(el)
    }).then(api => {
      api.initialize({
        client_id: clientId,
        callback: r => { if (r.credential !== undefined) pending?.(r.credential) },
      })
      return api
    })

    // 失败不缓存：网络恢复之后再敲一次 login 应该能重试，
    // 而不是被第一次的失败永久钉死。
    ready.catch(() => { ready = null })
    return ready
  }

  return {
    async renderButton(el, opts) {
      const api = await ensure()
      pending = opts.onCredential
      api.renderButton(el, {
        type: 'standard',
        theme: 'filled_black',      // 终端底色是深的
        size: 'medium',
        shape: 'pill',
        text: 'signin_with',
      })
    },

    disableAutoSelect() {
      getGlobal()?.disableAutoSelect()
    },
  }
}

/** client_id 是公开信息，走 env 只为好换。缺失时 login 会打印明确错误。 */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

/** 全站共用一个实例：GIS 的 initialize 是全局一次性的。 */
export const browserGis: Gis = createGis(GOOGLE_CLIENT_ID)
```

- [ ] **Step 2: 写按钮组件**

创建 `src/ui/auth/SignInButton.tsx`：

```tsx
import { useEffect, useRef } from 'react'
import type { Gis } from './gis'

/**
 * 挂载即请求 GIS 把官方按钮画进这个容器。按钮活在 Google 的 iframe 里，
 * 只能选主题与尺寸，没法完全终端化 —— 这是换取「点击必定弹窗」这个确定性
 * 付出的代价，见设计文档「为什么不用 One Tap」。
 */
export function SignInButton(props: {
  gis: Gis
  onCredential(jwt: string): void
  onError(): void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    let alive = true
    props.gis
      .renderButton(el, { onCredential: jwt => { if (alive) props.onCredential(jwt) } })
      .catch(() => { if (alive) props.onError() })
    // 卸载后不再回调：命令可能已经被 Ctrl+C 中断，那时 resolve 一个
    // 早已 settle 的 promise 虽然无害，但让「谁还活着」保持显式更好推理。
    return () => { alive = false }
    // 只在挂载时渲染一次。props 每次渲染都是新函数引用，进依赖数组会导致
    // 按钮被反复重画。仓库既有同类抑制见 src/ui/BootSequence.tsx。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="signin-button" ref={ref} />
}
```

- [ ] **Step 3: 写真实的 CredentialSource**

创建 `src/ui/auth/buttonCredential.tsx`：

```tsx
import { node, type Ctx, type IO } from '../../core/process'
import { AUTH_TEXT } from '../../i18n/messages'
import { SignInButton } from './SignInButton'
import { browserGis, GOOGLE_CLIENT_ID } from './gis'

/**
 * 真实的 CredentialSource：往输出块里写一个带 Google 按钮的 node chunk，
 * 然后等着它回调。命令在这期间一直挂着，终端处于 running 态 ——
 * 这正是想要的：Ctrl+C 能中断它。
 */
export function buttonCredential(io: IO, ctx: Ctx): Promise<string> {
  const t = AUTH_TEXT[ctx.host.currentLang()]

  if (GOOGLE_CLIENT_ID === '') return Promise.reject(new Error(t.missingClientId))

  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(new Error('aborted'))
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    const settle = () => ctx.signal.removeEventListener('abort', onAbort)

    io.stdout.writeLine(t.prompt)
    io.stdout.write(node(
      <SignInButton
        gis={browserGis}
        onCredential={jwt => { settle(); resolve(jwt) }}
        onError={() => { settle(); reject(new Error(t.unavailable)) }}
      />,
      // 这个 block 被 grep / 管道读取时的文本形态
      () => '[Sign in with Google]\n',
    ))
  })
}
```

- [ ] **Step 4: 注册 login**

修改 `src/ui/commands/index.ts`：

在 `import { matrix } from './matrix'` 下面加：

```ts
import { createLogin } from '../../commands/sys/login'
import { buttonCredential } from '../auth/buttonCredential'
```

把 `uiCommands` 那一行改成：

```ts
// login 本身是纯 TS（住在 src/commands/sys/login.ts），但它需要一个会渲染
// React 的 credential source，所以接线发生在这里而不是 builtins。
export const uiCommands: Process[] = [about, projects, skills, contact, resume, open, matrix, createLogin(buttonCredential)]
```

- [ ] **Step 5: 加按钮的样式**

在 `src/styles/terminal.css` 末尾追加：

```css
/* Google 按钮活在它自己的 iframe 里，外面只能控制留白与对齐 */
.signin-button {
  margin: 0.4em 0 0.2em;
}
```

- [ ] **Step 6: 配置本地环境变量**

创建 `.env.local`（已被 `.gitignore` 的 `*.local` 覆盖，不会进仓库）：

```
VITE_GOOGLE_CLIENT_ID=666352621962-eqe7ja34apm616pgrab62r7ah8egjt8c.apps.googleusercontent.com
```

- [ ] **Step 7: 配置构建注入**

修改 `.github/workflows/deploy.yml`，把这一行：

```yaml
      - run: pnpm build
```

改成：

```yaml
      - run: pnpm build
        env:
          # client_id 是公开信息，用 Variables 而不是 Secrets：
          # 它最终会出现在 dist 里，藏它没有意义，只会让排查变难。
          VITE_GOOGLE_CLIENT_ID: ${{ vars.GOOGLE_CLIENT_ID }}
```

- [ ] **Step 8: 验证**

Run: `pnpm lint && pnpm exec tsc -b --force && pnpm test && pnpm build`
Expected: 四条全过。`i18nCoverage` 此刻会检查 `login`（已进 `uiCommands`）的中英翻译——Task 3 已经补过。

- [ ] **Step 9: 提交**

```bash
git add src/ui/auth src/ui/commands/index.ts src/styles/terminal.css .github/workflows/deploy.yml
git commit -m "feat(auth): GIS 适配层、登录按钮与命令注册

唯一接触 window.google.accounts.id 的地方，形状照抄 languageModel.ts。
脚本运行时注入不打包，保持零新增运行时依赖。

加载带 10s 超时：accounts.google.com 在中国大陆不可达，而站点面向
相当比例的中文访客 —— 没有它 login 会永远转圈。失败不缓存，
网络恢复后再敲一次 login 应该能重试。"
```

---

### Task 5: 恢复 USER 与开机欢迎语

**Files:**
- Modify: `src/ui/useTerminal.ts`、`src/ui/Terminal.tsx`
- Test: 无新测试（改动是 UI 接线；由 Task 6 的手动冒烟验收）

**Interfaces:**
- Consumes: Task 1 的 `usernameOf`；Task 2 的 `createAuthStore`；Task 4 的 `browserGis`；`AUTH_TEXT`
- Produces: `useTerminal()` 返回值新增 `bootIdentity: Identity | null`

- [ ] **Step 1: 在 useTerminal 里建 store 并接进内核**

修改 `src/ui/useTerminal.ts`。

顶部 import 区加：

```ts
import { createAuthStore } from '../core/auth/store'
import { usernameOf } from '../core/auth/identity'
import { browserGis } from './auth/gis'
```

在 `const [ai] = useState(() => createBrowserAi())` 那一行下面加：

```ts
  // 与 ai 同理：惰性建一次，且必须活在 kernel 的 useMemo 之外 ——
  // 切语言会重建内核，登录态不该跟着没。
  // onSignOut 里调 GIS：core 不能碰浏览器全局，这个钩子就是为它留的。
  const [auth] = useState(() => createAuthStore({ onSignOut: () => browserGis.disableAutoSelect() }))

  // 开机欢迎语只在首屏用一次，所以在这里定格。直接在渲染期读 auth.identity()
  // 的话，它是普通可变状态、登录后不会触发重渲染，语义会含糊。
  const [bootIdentity] = useState(() => auth.identity())
```

把 `createKernel({ ... })` 那个调用改成（新增 `auth` 与 `env` 两行）：

```ts
  const kernel = useMemo<Kernel>(() => createKernel({
    vfs: buildInitialVfs(loadContent(lang)),
    host: createUiHost(hooksBox),
    commands: [...builtins, ...uiCommands],
    ai,
    auth,
    // 上次会话登录过就让提示符直接是登录态。切语言重建内核时这里会重新求值，
    // 所以登录后再切语言，提示符也不会退回 guest。
    env: (() => {
      const id = auth.identity()
      return id === null ? {} : { USER: usernameOf(id) }
    })(),
  }), [lang, hooksBox, ai, auth])
```

在 `return { ... }` 里，`lang,` 那一行下面加：

```ts
    bootIdentity,
```

- [ ] **Step 2: 在开机动画后追加欢迎语**

修改 `src/ui/Terminal.tsx`。

顶部 import 区加：

```ts
import { AUTH_TEXT } from '../i18n/messages'
```

把 `bootLines` 的 `useMemo` 改成：

```ts
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
```

- [ ] **Step 3: 验证**

Run: `pnpm lint && pnpm exec tsc -b --force && pnpm test && pnpm build`
Expected: 四条全过。特别留意 `src/ui/Terminal.test.tsx` 与 `src/ui/useTerminal.test.tsx` 仍然绿——它们构造终端时不传 auth，走的是默认路径。

- [ ] **Step 4: 提交**

```bash
git add src/ui/useTerminal.ts src/ui/Terminal.tsx
git commit -m "feat(auth): 刷新后保持登录态，开机欢迎语带名字

auth store 活在 kernel 的 useMemo 之外：切语言会重建内核，登录态不该跟着没。
env.USER 在建内核时从 store 求值，所以登录后切语言，提示符也不退回 guest。

欢迎语作为独立一行追加在 motd 之后，不去改 /etc/motd —— 它模拟的是
真实系统文件，塞动态问候会把它弄脏。"
```

---

### Task 6: 文档、手动冒烟与收尾

**Files:**
- Modify: `README.md`、`README.en.md`
- Test: 手动冒烟（这是 Task 4 / Task 5 的真正验收）

**Interfaces:**
- Consumes: 前五个任务的全部产出
- Produces: 无代码产出

- [ ] **Step 1: 准备 Google Cloud Console**

这一步需要人操作，不是代码：

1. 打开 Google Cloud Console → APIs & Services → Credentials → 项目 `hanbeeger` 的那个 OAuth 2.0 Client ID
2. 在 **Authorized JavaScript origins** 里加上 `http://localhost:5173`（Vite 默认端口）。**不加这条本地根本测不了** —— 当前只授权了 `https://i.xiaohan.dev`，GIS 会直接拒绝。
3. 顺手把 **client secret** rotate 掉：它在设计讨论中明文出现过，且本方案完全用不到它。
4. 在 GitHub 仓库 Settings → Secrets and variables → Actions → **Variables** 里新增 `GOOGLE_CLIENT_ID`，值为 `666352621962-eqe7ja34apm616pgrab62r7ah8egjt8c.apps.googleusercontent.com`（用 Variables 不是 Secrets：它最终会出现在 dist 里，藏它没有意义）。

- [ ] **Step 2: 手动冒烟**

Run: `pnpm dev`，浏览器打开 `http://localhost:5173`，逐条走：

| # | 操作 | 期望 |
|---|---|---|
| 1 | `help` | 列表里有 `login` 与 `logout` |
| 2 | `man login` | 打出英文 usage（默认语言是 en） |
| 3 | `login` | 输出一行提示 + 一个 Google 按钮 |
| 4 | 点按钮、选账号 | 弹窗关闭，打出绿色 `Signed in as …`，退出码 0 |
| 5 | 看提示符 | 从 `guest@terminal:~$` 变成 `xiaohan@terminal:~$` |
| 6 | `whoami` | `Xiaohan Cui <…@gmail.com>` |
| 7 | `echo $USER` | `xiaohan` |
| 8 | `login` | 直接回显「已经登录为…」，**不再弹窗** |
| 9 | 刷新页面 | 开机动画后多一行 `Welcome back, …`，提示符仍是 `xiaohan@` |
| 10 | `lang zh` | 切中文后提示符仍是 `xiaohan@`（不退回 guest） |
| 11 | `logout` | 打出「已退出登录」，提示符回 `guest@` |
| 12 | `whoami` | `guest` |
| 13 | 刷新页面 | 没有欢迎语，提示符是 `guest@` |
| 14 | `login` 后立刻按 Ctrl+C | 命令中止回到提示符，`echo $?` 是 `130` |
| 15 | 断网后 `login`，等 10 秒 | 打出红色「连不上 Google 登录服务」，**不会一直转** |

任何一条不符就停下来修，别继续往下走。

- [ ] **Step 3: 补 README（中文）**

修改 `README.md`。找到列命令的那一节，把 `login` / `logout` 加进去；并在合适位置补一小节：

```markdown
### Google 登录

`login` 用 Google 账号登录，登录后提示符、`whoami` 与开机欢迎语都会认得你，
`logout` 退出。**纯前端实现**：拿到的 ID token 只留在内存里，只有姓名与邮箱
会存进 localStorage，没有任何后端参与，也不解锁任何隐藏内容。

构建需要 `VITE_GOOGLE_CLIENT_ID`。本地开发把它写进 `.env.local`，
并把 `http://localhost:5173` 加进 Google Cloud Console 的
Authorized JavaScript origins。
```

- [ ] **Step 4: 补 README（英文）**

修改 `README.en.md`，在与上面**对称的位置**补等价内容：

```markdown
### Sign in with Google

`login` signs you in with a Google account — the prompt, `whoami` and the boot
greeting all recognise you afterwards; `logout` signs you out. **Entirely
client-side**: the ID token stays in memory, only the name and email are kept in
localStorage, no backend is involved, and nothing hidden is unlocked.

Builds need `VITE_GOOGLE_CLIENT_ID`. For local development put it in
`.env.local` and add `http://localhost:5173` to the Authorized JavaScript
origins in the Google Cloud Console.
```

- [ ] **Step 5: 确认两份 README 仍然对称**

Run: `git diff README.md README.en.md`
逐节比对：中文加了几处，英文就该在对应位置有几处。仓库刚做完一轮双语对齐（见 `d6863a7`、`b413129`），别破坏它。

- [ ] **Step 6: 最终全量验证**

Run: `pnpm lint && pnpm exec tsc -b --force && pnpm test && pnpm build`
Expected: 四条全过。

- [ ] **Step 7: 提交**

```bash
git add README.md README.en.md
git commit -m "docs: 补 Google 登录一节（中英双份）

明确写出它是纯前端的：token 不落盘、没有后端、不解锁任何隐藏内容 ——
避免读者按常规 OAuth 的心智去理解它能做什么。"
```
