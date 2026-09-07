import type { Lang } from '../core/process'

type Kind = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading'

/**
 * 命令的运行时输出文案。和 i18n/commands.ts 的分工是：那边是 help/man 里的
 * 描述与用法（查不到就回落到 Process 自带字段），这边是命令跑起来真正打到
 * 屏幕上的话，没有回落可言 —— 少一种语言就是英文站点上冒出一段中文。
 *
 * 本文件被 src/commands/ 下的命令 import，所以必须保持零 React 依赖。
 */

/**
 * 不可用时的文案才是主路径 —— 网页环境下 Prompt API 仍需 flag 或 Origin Trial，
 * 绝大多数访客落在 unsupported。所以四种状态各给各的说明，
 * 而不是笼统报一句「不支持」让人不知道下一步做什么。
 */
export const DIAGNOSIS_TEXT: Record<Lang, Record<Kind, string[]>> = {
  en: {
    unsupported: [
      'This browser has no built-in model.',
      '',
      'ask uses Chrome’s built-in Gemini Nano — the model runs on your own',
      'machine, nothing is sent to a server, and it works offline.',
      '',
      'To try it you need Chrome 138+ with this flag enabled:',
      '  chrome://flags/#prompt-api-for-gemini-nano',
      '',
      'If you can’t, nothing else here depends on it. Try `help`.',
    ],
    unavailable: [
      'This device can’t run the built-in model.',
      '',
      'The bar is roughly 22GB of free disk plus either 4GB of VRAM or 16GB of RAM.',
      'Chrome sets that, not me.',
    ],
    // 这条只在「无参数进入对话模式」的前置检查里出现——一次性问答
    // (`ask <question>`) 会直接触发下载，不再走这条早退分支。
    downloadable: [
      'The built-in model hasn’t been downloaded yet.',
      '',
      'Asking a question with `ask <question>` starts the download (about 2GB,',
      'once). After it finishes you can just ask.',
    ],
    downloading: [
      'The model is still downloading.',
      '',
      'Come back when it finishes. `ask --status` shows where it is.',
    ],
  },
  zh: {
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
      '用 `ask <问题>` 提问会自动触发下载（约 2GB，只需一次），',
      '下载完成后可以直接提问。',
    ],
    downloading: [
      '模型正在下载，还没就绪。',
      '',
      '下完再来。随时可以用 `ask --status` 看当前状态。',
    ],
  },
}

interface AskText {
  /** `--status` 那一行的前缀，后面直接跟状态标识符。 */
  statusLabel: string
  /** 一次性问答遇到 downloadable 时，下载开始前的那句提示。 */
  downloadStart: string
  /** 进入对话模式前的引导。三种退出方式在任何语言下都不能少。 */
  chatEnter: string[]
  /** system prompt 里的人设与语言要求，简历资料之前的那几行。 */
  persona: string[]
}

export const ASK_TEXT: Record<Lang, AskText> = {
  en: {
    statusLabel: 'model status: ',
    downloadStart: 'The built-in model isn’t downloaded yet; starting the download (about 2GB, once)…',
    chatEnter: [
      'Entering chat mode. What you type next goes straight to the model, and turns share context.',
      'Type exit, press Ctrl+D, or press Ctrl+C while idle to leave.',
    ],
    persona: [
      'You are the owner of this personal site, answering a visitor in your own terminal.',
      'Use first person. Keep it plain and direct, the way engineers talk. Answer briefly.',
      '',
      'Answer only from the material below. If it is not there, say you do not know.',
      'Do not invent jobs, companies, dates, or numbers — making things up is worse',
      'than admitting you do not know.',
      '',
      'Answer in English.',
    ],
  },
  zh: {
    statusLabel: '模型状态: ',
    downloadStart: '内置模型尚未下载，开始下载（约 2GB，只需一次）…',
    chatEnter: [
      '进入对话模式，接下来的输入直接发给模型，多轮共享上下文。',
      '输入 exit、按 Ctrl+D，或在空闲时按 Ctrl+C 退出。',
    ],
    persona: [
      '你是这个个人主页的主人本人，正在自己的终端里回答访客提问。',
      '用第一人称，语气克制直接，像工程师之间说话，不要营销腔。回答简短，几句话即可。',
      '',
      '严格只依据下面的资料回答。资料里没有的就说不知道，',
      '不要编造经历、公司、时间或数字 —— 编造比承认不知道糟糕得多。',
      '',
      '用中文回答。',
    ],
  },
}

/**
 * `lang` 列表里每一行的标签，故意**不**按界面语言分两份 —— 这是这条命令里唯一
 * 不跟随界面语言的输出。报错和提示是说给当前用户听的，标签是给用户找自己那行
 * 用的：只读中文的访客落在英文界面上，正是靠「中文」这三个字认出该点哪个，
 * 翻成 Chinese 反而把他要找的路标拆了。所以放在 LANG_TEXT 外面，
 * 让「两种语言下必然相同」是结构上做不到不同，而不是两处字面碰巧一样。
 */
export const LANG_LABEL: Record<Lang, string> = { en: 'English', zh: '中文' }

interface LangText {
  unknown(value: string, available: string): string
  already(label: string): string
  switched(label: string): string
}

export const LANG_TEXT: Record<Lang, LangText> = {
  en: {
    unknown: (value, available) => `lang: ${value}: unknown language. Available: ${available}`,
    already: label => `The interface is already in ${label}.`,
    switched: label => `Interface language switched to ${label}. The session is rebuilt: `
      + `the temporary files you created, your shell history and the variables you `
      + `exported are gone, and the working directory is reset to ~.`,
  },
  zh: {
    unknown: (value, available) => `lang: ${value}: 未知语言。可用：${available}`,
    already: label => `当前语言已经是 ${label}。`,
    switched: label => `语言已切换为 ${label}。会话会重建：`
      + `你创建的临时文件、shell 历史，以及 export 出来的环境变量都会清空，当前目录回到 ~。`,
  },
}

/** resume 自己拼的段落标题 —— 它们不来自任何内容文件，得单独翻。 */
export const RESUME_TEXT: Record<Lang, { skills: string; projects: string }> = {
  en: { skills: 'Skills', projects: 'Projects' },
  zh: { skills: '技能', projects: '项目' },
}
