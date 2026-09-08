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
