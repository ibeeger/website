import { LANGS, type Lang } from '../../i18n/lang'
import { LANG_LABEL, LANG_TEXT } from '../../i18n/ui'
import type { Process, Style } from '../../core/process'

const ACTIVE: Style = { color: 'green', bold: true }

function isLang(v: string): v is Lang {
  return (LANGS as readonly string[]).includes(v)
}

export const lang: Process = {
  name: 'lang',
  description: '查看或切换界面语言',
  usage: 'lang [en|zh]',
  complete(argv) {
    const frag = argv[argv.length - 1] ?? ''
    return LANGS.filter(l => l.startsWith(frag))
  },

  async run(io, ctx) {
    const wanted = io.argv[1]
    const current = ctx.host.currentLang()
    const t = LANG_TEXT[current]

    if (wanted === undefined) {
      for (const l of LANGS) {
        const isCurrent = l === current
        io.stdout.writeLine(`  ${isCurrent ? '*' : ' '} ${l}  ${LANG_LABEL[l]}`, isCurrent ? ACTIVE : undefined)
      }
      return 0
    }

    if (!isLang(wanted)) {
      io.stderr.writeLine(t.unknown(wanted, LANGS.join(', ')))
      return 1
    }

    // 切换重建的是整个内核（useTerminal 里那个按 lang memo 的 createKernel），
    // 而 VFS、env、cwd、history 全挂在它上面 —— 丢的不只是 touch 出来的文件。
    // 不说就是静默丢数据，只说文件则是说漏了一半。
    // 但选的就是当前语言时什么都不会重建（useLang 的 setState 同值直接 bail out，
    // 内核那个 useMemo 也就不会重算），这时候还报「已清空」就是在描述没发生的事。
    io.stdout.writeLine(wanted === current
      ? t.already(LANG_LABEL[wanted])
      : t.switched(LANG_LABEL[wanted]))
    ctx.host.setLang(wanted)
    return 0
  },
}
