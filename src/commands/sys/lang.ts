import { LANGS, type Lang } from '../../i18n/lang'
import type { Process, Style } from '../../core/process'

const ACTIVE: Style = { color: 'green', bold: true }

const LABEL: Record<Lang, string> = { en: 'English', zh: '中文' }

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

    if (wanted === undefined) {
      const current = ctx.host.currentLang()
      for (const l of LANGS) {
        const isCurrent = l === current
        io.stdout.writeLine(`  ${isCurrent ? '*' : ' '} ${l}  ${LABEL[l]}`, isCurrent ? ACTIVE : undefined)
      }
      return 0
    }

    if (!isLang(wanted)) {
      io.stderr.writeLine(`lang: ${wanted}: 未知语言。可用：${LANGS.join(', ')}`)
      return 1
    }

    // 切换会重建整棵文件树 —— 用户 touch 出来的文件会消失。不说就是静默丢数据。
    // 先写再切：setLang 会触发内核重建，这一行属于切换前那次运行的输出。
    io.stdout.writeLine(`语言已切换为 ${LABEL[wanted]}。你创建的临时文件已清空。`)
    ctx.host.setLang(wanted)
    return 0
  },
}
