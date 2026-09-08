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
