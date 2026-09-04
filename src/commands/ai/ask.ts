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
  downloadable: [
    '内置模型还没下载到本地。',
    '',
    '首次使用要下载约 2GB 的模型文件，Chrome 会在后台进行。',
    '下完之后再跑一次 `ask` 就可以了。',
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
  description: '问我点什么（浏览器本地模型）',
  usage: 'ask [--status] [问题...]',

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
    if (!question && !piped) {
      io.stderr.writeLine('用法: ask [--status] [问题...]')
      io.stderr.writeLine('例如: ask 你会 React 吗')
      io.stderr.writeLine('      cat about.md | ask 用一句话总结')
      return 2
    }

    if (status.kind !== 'ready') {
      for (const l of DIAGNOSIS[status.kind]) io.stderr.writeLine(l)
      return 1
    }

    // 管道内容放前面当上下文，问题放后面 —— 小模型对结尾的指令更敏感。
    const input = piped ? `${piped}\n\n${question || '请总结上面的内容。'}` : question

    let session
    try {
      session = await ctx.ai.createSession({ systemPrompt: buildSystemPrompt(ctx) })
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
