import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestCtx, runCmd } from '../testkit'
import { createLogin } from './login'
import { logout } from './logout'
import { whoami } from './whoami'
import type { Ctx } from '../../core/process'
import { AUTH_STORAGE_KEY } from '../../core/auth/store'

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
beforeEach(() => {
  // 干净 slate 不能靠「node 环境下没有 localStorage」这个偶然条件撑着 ——
  // 这份 try/catch 在 node 下什么也不做（localStorage 不存在），在 jsdom
  // 下真正清掉上一个用例留下的存档，两种环境下这份「干净」都是显式给出的。
  try { localStorage.removeItem(AUTH_STORAGE_KEY) } catch { /* node 环境下没有 localStorage */ }
  ctx = makeTestCtx()
})

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
