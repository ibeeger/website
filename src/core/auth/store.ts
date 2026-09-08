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
