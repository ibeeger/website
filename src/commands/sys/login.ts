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
