import { readAll } from '../lib'
import type { AiStatus, Ctx, Process } from '../../core/process'

/**
 * 不可用时的文案才是主路径 —— 网页环境下 Prompt API 仍需 flag 或 Origin Trial，
 * 绝大多数访客落在 unsupported。所以四种状态各给各的说明，
 * 而不是笼统报一句「不支持」让人不知道下一步做什么。
 */
const DIAGNOSIS: Record<Exclude<AiStatus['kind'], 'ready'>, string[]> = {
  unsupported: [
    '这个浏览器没有内置模型。',
    '',
    'ask 用的是 Chrome 内置的 Gemini Nano —— 模型跑在你本地，',
    '问题不会发到任何服务器，断网也能用。',
    '',
    '想试的话需要 Chrome 138+，并开启：',
    '  chrome://flags/#prompt-api-for-gemini-nano',
    '',
    '开不了也不影响别的，站点其余部分都不依赖它。试试 `help`。',
  ],
  unavailable: [
    '这台设备跑不动内置模型。',
    '',
    '硬件门槛大致是 22GB 可用磁盘，外加 4GB 以上显存或 16GB 以上内存。',
    '这是 Chrome 定的，不是我定的。',
  ],
  // 这条只在「无参数进入对话模式」的前置检查里出现——一次性问答
  // (`ask <问题>`) 会直接触发下载，不再走这条早退分支。
  downloadable: [
    '内置模型还没下载到本地。',
    '',
    '用 `ask <问题>` 提问会自动触发下载（约 2GB，只需一次），',
    '下载完成后可以直接提问。',
  ],
  downloading: [
    '模型正在下载，还没就绪。',
    '',
    '下完再来。随时可以用 `ask --status` 看当前状态。',
  ],
}

const PERSONA_FILES = ['about.md', 'skills.json']

/** 从虚拟文件系统读简历拼 system prompt —— 内容改了自动跟着变，不用改代码。 */
function buildSystemPrompt(ctx: Ctx): string {
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

  return [
    '你是这个个人主页的主人本人，正在自己的终端里回答访客提问。',
    '用第一人称，语气克制直接，像工程师之间说话，不要营销腔。回答简短，几句话即可。',
    '',
    '严格只依据下面的资料回答。资料里没有的就说不知道，',
    '不要编造经历、公司、时间或数字 —— 编造比承认不知道糟糕得多。',
    '',
    '--- 我的资料 ---',
    ...parts,
    '--- 资料结束 ---',
  ].join('\n')
}

export const ask: Process = {
  name: 'ask',
  description: '和我聊聊（浏览器本地模型）',
  usage: 'ask [--status] [问题...]\n  ask            进入对话模式，exit、Ctrl+D 或空闲时 Ctrl+C 退出\n  ask <问题>      一次性问答',

  async run(io, ctx) {
    const args = io.argv.slice(1)
    const status = await ctx.ai.status()

    if (args.includes('--status')) {
      io.stdout.writeLine(`模型状态: ${status.kind}`)
      if (status.kind !== 'ready') {
        for (const l of DIAGNOSIS[status.kind]) io.stdout.writeLine(l)
      }
      return 0
    }

    const question = args.join(' ').trim()
    const piped = io.stdin ? (await readAll(io.stdin)).trim() : ''

    // 无参数、无管道 —— 这是「进入对话模式」的信号。
    // 先确认模型可用再进，否则用户进去才发现跑不了，还得再学一次怎么退出。
    if (!question && !piped) {
      if (status.kind !== 'ready') {
        for (const l of DIAGNOSIS[status.kind]) io.stderr.writeLine(l)
        return 1
      }
      // 进入模式唯一的视觉变化是提示符换成 ask>，屏幕上没有任何地方交代
      // 怎么出去；提示符又在 aria-live 区域之外，读屏用户连这点变化都收不到。
      // 所以这行引导既是给视觉用户的出口说明，也是模式切换在无障碍树里
      // 唯一一处会被播报的痕迹。退出方式与 usage 保持一致。
      io.stdout.writeLine('进入对话模式，接下来的输入直接发给模型，多轮共享上下文。')
      io.stdout.writeLine('输入 exit、按 Ctrl+D，或在空闲时按 Ctrl+C 退出。')
      ctx.host.enterChat({ systemPrompt: buildSystemPrompt(ctx) })
      return 0
    }

    // downloadable 是唯一「现在做点什么就能变可用」的状态。
    // 只提示「去下载」是把一个 2GB 的黑箱丢给用户，所以这里直接触发并报进度。
    if (status.kind === 'downloadable') {
      io.stdout.writeLine('内置模型尚未下载，开始下载（约 2GB，只需一次）…')
    }

    if (status.kind !== 'ready' && status.kind !== 'downloadable') {
      for (const l of DIAGNOSIS[status.kind]) io.stderr.writeLine(l)
      return 1
    }

    // 管道内容放前面当上下文，问题放后面 —— 小模型对结尾的指令更敏感。
    const input = piped ? `${piped}\n\n${question || '请总结上面的内容。'}` : question

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
        systemPrompt: buildSystemPrompt(ctx),
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
