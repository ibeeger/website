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
