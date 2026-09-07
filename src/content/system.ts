import type { Lang } from '../core/process'

const MOTD: Record<Lang, string> = {
  en: [
    'Welcome to terminal-site.',
    '',
    "Type 'help' to see available commands.",
    "Type 'about' if you'd rather just read.",
    '',
  ].join('\n'),
  zh: [
    'Welcome to terminal-site.',
    '',
    "输入 'help' 查看可用命令。",
    "输入 'about' 直接读文字版。",
    '',
  ].join('\n'),
}

/** 与语言无关的系统文件：它们模拟的是真实系统，本来就不该本地化。 */
const LANG_NEUTRAL: Record<string, string> = {
  '/etc/passwd': [
    'root:x:0:0:root:/root:/bin/bash',
    'guest:x:1000:1000:Guest User:/home/guest:/bin/bash',
    '',
  ].join('\n'),

  '/proc/version': 'Linux version 6.6.0-web (browser@wasm) #1 SMP PREEMPT_DYNAMIC\n',

  '/home/guest/.bashrc': [
    '# ~/.bashrc',
    '# 这里什么都没有。真的。',
    '# 但你既然找到了这里，试试 `neofetch`。',
    '',
  ].join('\n'),
}

export function systemFiles(lang: Lang): Record<string, string> {
  return { ...LANG_NEUTRAL, '/etc/motd': MOTD[lang] }
}
