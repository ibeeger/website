import type { Process } from '../../core/process'

const QUOTES = [
  '过早的优化是万恶之源。 —— Donald Knuth',
  '计算机科学只有两件难事：缓存失效和命名。',
  '能跑就别动它。—— 但你还是动了，对吧？',
  '任何足够先进的技术都与魔法无异。 —— Arthur C. Clarke',
  '删代码比写代码更让人快乐。',
  '这个 bug 在我机器上复现不了。',
]

export const fortune: Process = {
  name: 'fortune',
  description: '随机格言',
  usage: 'fortune',
  hidden: true,

  async run(io) {
    io.stdout.writeLine(QUOTES[Math.floor(Math.random() * QUOTES.length)]!)
    return 0
  },
}
