import type { Process } from '../../core/process'

export const open: Process = {
  name: 'open',
  description: '在新标签页打开链接',
  usage: 'open https://...',

  async run(io) {
    const url = io.argv[1]
    if (url === undefined) { io.stderr.writeLine('用法: open https://...'); return 2 }

    // 只放行 http(s)，挡掉 javascript: 与 data: 这类协议
    if (!/^https?:\/\//.test(url)) {
      io.stderr.writeLine(`open: 只支持 http 与 https 链接`)
      return 1
    }

    window.open(url, '_blank', 'noopener,noreferrer')
    io.stdout.writeLine(`已在新标签页打开 ${url}`)
    return 0
  },
}
