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
