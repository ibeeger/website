import { readAll } from '../lib'
import { ASK_TEXT, DIAGNOSIS_TEXT } from '../../i18n/messages'
import type { Ctx, Lang, Process } from '../../core/process'

const PERSONA_FILES = ['about.md', 'skills.json']

const MATERIAL_OPEN = '--- my material ---'
const MATERIAL_CLOSE = '--- end of material ---'

/** 只有管道输入、没带问题时替用户补的那句 —— 它进的是发给模型的提问本身。 */
const SUMMARIZE: Record<Lang, string> = {
  en: 'Summarize the text above.',
  zh: '请总结上面的内容。',
}

/** 从虚拟文件系统读简历拼 system prompt —— 内容改了自动跟着变，不用改代码。 */
function buildSystemPrompt(ctx: Ctx, lang: Lang): string {
  const home = ctx.env.get('HOME') ?? '/home/guest'
  const parts: string[] = []

  const readIfFile = (abs: string): string | null => {
    const it = ctx.vfs.stat(abs)
    return it?.kind === 'file' ? it.content.trim() : null
  }

  for (const name of PERSONA_FILES) {
    const c = readIfFile(`${home}/${name}`)
    if (c) parts.push(c)
  }

  const projects = `${home}/projects`
  if (ctx.vfs.isDir(projects)) {
    for (const entry of ctx.vfs.list(projects)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
      const c = readIfFile(`${projects}/${entry.name}`)
      if (c) parts.push(c)
    }
  }

  // 资料本身不翻译：VFS 里的内容已经是按当前语言构建的那一棵树。
  // 分隔符也不翻译：它只是给模型划范围用的标记，用户永远看不到这两行，
  // 翻它没有可观察收益，却要多两个接口字段和两条谁也没覆盖的分支。
  return [
    ...ASK_TEXT[lang].persona,
    '',
    MATERIAL_OPEN,
    ...parts,
    MATERIAL_CLOSE,
  ].join('\n')
}

export const ask: Process = {
  name: 'ask',
  description: '和我聊聊（浏览器本地模型）',
  usage: 'ask [--status] [问题...]\n  ask            进入对话模式，exit、Ctrl+D 或空闲时 Ctrl+C 退出\n  ask <问题>      一次性问答',

  async run(io, ctx) {
    const args = io.argv.slice(1)
    const status = await ctx.ai.status()
    const lang = ctx.host.currentLang()
    const t = ASK_TEXT[lang]
    const diagnosis = DIAGNOSIS_TEXT[lang]

    if (args.includes('--status')) {
      io.stdout.writeLine(`${t.statusLabel}${status.kind}`)
      if (status.kind !== 'ready') {
        for (const l of diagnosis[status.kind]) io.stdout.writeLine(l)
      }
      return 0
    }

    const question = args.join(' ').trim()
    const piped = io.stdin ? (await readAll(io.stdin)).trim() : ''

    // 无参数、无管道 —— 这是「进入对话模式」的信号。
    // 先确认模型可用再进，否则用户进去才发现跑不了，还得再学一次怎么退出。
    if (!question && !piped) {
      if (status.kind !== 'ready') {
        for (const l of diagnosis[status.kind]) io.stderr.writeLine(l)
        return 1
      }
      // 进入模式唯一的视觉变化是提示符换成 ask>，屏幕上没有任何地方交代
      // 怎么出去；提示符又在 aria-live 区域之外，读屏用户连这点变化都收不到。
      // 所以这行引导既是给视觉用户的出口说明，也是模式切换在无障碍树里
      // 唯一一处会被播报的痕迹。退出方式与 usage 保持一致。
      for (const l of t.chatEnter) io.stdout.writeLine(l)
      ctx.host.enterChat({ systemPrompt: buildSystemPrompt(ctx, lang) })
      return 0
    }

    // downloadable 是唯一「现在做点什么就能变可用」的状态。
    // 只提示「去下载」是把一个 2GB 的黑箱丢给用户，所以这里直接触发并报进度。
    if (status.kind === 'downloadable') {
      io.stdout.writeLine(t.downloadStart)
    }

    if (status.kind !== 'ready' && status.kind !== 'downloadable') {
      for (const l of diagnosis[status.kind]) io.stderr.writeLine(l)
      return 1
    }

    // 管道内容放前面当上下文，问题放后面 —— 小模型对结尾的指令更敏感。
    const input = piped ? `${piped}\n\n${question || SUMMARIZE[lang]}` : question

    const bar = (pct: number) => {
      const filled = Math.round(pct / 5)
      return `[${'#'.repeat(filled)}${'.'.repeat(20 - filled)}] ${pct}%`
    }

    // Writer 是纯追加契约，画不出「原地刷新的一行进度条」。而 Chrome 在这 2GB
    // 下载期间会密集派发 downloadprogress，每个事件写一行会往 scrollback 灌
    // 几百行，把用户此前的输出全冲走。按 5% 一档去重，整个下载最多留下
    // 0/5/…/100 这一串，首尾两端都保证出现。
    const PROGRESS_STEP = 5
    let lastStep = -1
    const reportProgress = (p: number) => {
      const pct = Math.min(100, Math.max(0, Math.round(p * 100)))
      const step = Math.floor(pct / PROGRESS_STEP)
      if (step === lastStep) return
      lastStep = step
      io.stdout.writeLine(bar(pct))
    }

    let session
    try {
      session = await ctx.ai.createSession({
        systemPrompt: buildSystemPrompt(ctx, lang),
        // 模型未下载时这一步就是那 2GB 下载本身，可能持续十几分钟。不把 signal
        // 交进去的话，Ctrl+C 只会让 ctx.signal 变 aborted 而下载照跑，run() 一直
        // 挂在这个 await 上；UI 那边 abortRef 未释放，之后的输入会被重入守卫
        // 静默吞掉 —— 终端表现为完全冻住，只能刷新页面。
        signal: ctx.signal,
        ...(status.kind === 'downloadable' ? { onProgress: reportProgress } : {}),
      })
      for await (const piece of session.promptStreaming(input, { signal: ctx.signal })) {
        io.stdout.writeText(piece)
      }
      io.stdout.writeText('\n')
      return 0
    } catch (e) {
      io.stderr.writeLine(`ask: ${e instanceof Error ? e.message : String(e)}`)
      return 1
    } finally {
      session?.destroy()
    }
  },
}
