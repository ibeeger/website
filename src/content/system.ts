export const systemFiles: Record<string, string> = {
  '/etc/motd': [
    'Welcome to terminal-site.',
    '',
    "Type 'help' to see available commands.",
    "Type 'about' if you'd rather just read.",
    '',
  ].join('\n'),

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
