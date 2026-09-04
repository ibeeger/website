import { readAll } from '../lib'
import type { Process } from '../../core/process'

const COW = [
  '        \\   ^__^',
  '         \\  (oo)\\_______',
  '            (__)\\       )\\/\\',
  '                ||----w |',
  '                ||     ||',
]

export const cowsay: Process = {
  name: 'cowsay',
  description: '让牛替你说话',
  usage: 'cowsay [文字]',
  hidden: true,

  async run(io) {
    const fromArgs = io.argv.slice(1).join(' ')
    const text = (fromArgs || (await readAll(io.stdin)).trim() || '你好，欢迎来到我的终端。').trim()
    const bar = '-'.repeat(text.length + 2)

    io.stdout.writeLine(` ${bar}`)
    io.stdout.writeLine(`< ${text} >`)
    io.stdout.writeLine(` ${bar}`)
    for (const l of COW) io.stdout.writeLine(l)
    return 0
  },
}
