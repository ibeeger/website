import type { Lang } from '../core/process'

type Text = { description?: string; usage?: string }

/**
 * 命令描述不放进 Process 契约：那会让每个命令都背上翻译职责，
 * 新增命令必须先想好两种语言才能落地。放外置表 + 回落，
 * 新命令不写翻译也能工作，只是显示原文。
 *
 * 彩蛋命令（sudo/cowsay/neofetch/fortune/exit/matrix）不进表：它们藏在 help 之外，
 * 中文本身就是彩蛋属性的一部分。
 */
const TABLE: Record<Lang, Record<string, Text>> = {
  en: {
    ls: { description: 'List directory contents', usage: 'ls [-la] [path]' },
    pwd: { description: 'Print working directory', usage: 'pwd' },
    cd: { description: 'Change directory', usage: 'cd [path]' },
    cat: { description: 'Print file contents', usage: 'cat [file...]' },
    head: { description: 'Print the first lines of a file', usage: 'head [-n count] [file...]' },
    tail: { description: 'Print the last lines of a file', usage: 'tail [-n count] [file...]' },
    wc: { description: 'Count lines, words and characters', usage: 'wc [-lwc] [file...]' },
    tree: { description: 'Print the directory tree', usage: 'tree [path]' },
    find: { description: 'Find files by name', usage: 'find [path] [-name pattern]' },
    touch: { description: 'Create an empty file', usage: 'touch file...' },
    mkdir: { description: 'Create a directory', usage: 'mkdir [-p] directory...' },
    rm: { description: 'Remove files or directories', usage: 'rm [-rf] path...' },
    echo: { description: 'Print text', usage: 'echo [text...]' },
    grep: { description: 'Search for a pattern', usage: 'grep pattern [file...]' },
    sort: { description: 'Sort lines', usage: 'sort [-r] [file...]' },
    uniq: { description: 'Collapse adjacent duplicate lines', usage: 'uniq [-c] [file...]' },
    help: { description: 'List available commands', usage: 'help' },
    man: { description: 'Show command usage', usage: 'man command' },
    whoami: { description: 'Print the current user', usage: 'whoami' },
    uname: { description: 'Print system information', usage: 'uname [-a]' },
    date: { description: 'Print the current date and time', usage: 'date' },
    env: { description: 'List environment variables', usage: 'env' },
    export: { description: 'Set an environment variable', usage: 'export NAME=value' },
    which: { description: 'Locate a command', usage: 'which command' },
    history: { description: 'Show command history', usage: 'history' },
    clear: { description: 'Clear the screen', usage: 'clear' },
    theme: { description: 'Show or switch the color theme', usage: 'theme [name]' },
    lang: { description: 'Show or switch interface language', usage: 'lang [en|zh]' },
    login: { description: 'Sign in with your Google account', usage: 'login' },
    logout: { description: 'Sign out', usage: 'logout' },
    about: { description: 'About me', usage: 'about' },
    contact: { description: 'How to reach me', usage: 'contact' },
    projects: { description: 'Things I have built', usage: 'projects' },
    skills: { description: 'Tech stack', usage: 'skills' },
    resume: { description: 'One-page résumé', usage: 'resume' },
    open: { description: 'Open a link in a new tab', usage: 'open https://...' },
    ask: {
      description: 'Talk to me (browser-local model)',
      usage: 'ask [--status] [question...]\n  ask            enter chat mode; exit, Ctrl+D or Ctrl+C when idle to leave\n  ask <question> one-off question',
    },
  },
  zh: {
    ls: { description: '列出目录内容', usage: 'ls [-la] [路径]' },
    pwd: { description: '显示当前目录', usage: 'pwd' },
    cd: { description: '切换目录', usage: 'cd [路径]' },
    cat: { description: '打印文件内容', usage: 'cat [文件...]' },
    head: { description: '打印文件开头若干行', usage: 'head [-n 行数] [文件...]' },
    tail: { description: '打印文件末尾若干行', usage: 'tail [-n 行数] [文件...]' },
    wc: { description: '统计行数、词数与字符数', usage: 'wc [-lwc] [文件...]' },
    tree: { description: '打印目录树', usage: 'tree [路径]' },
    find: { description: '按名称查找文件', usage: 'find [路径] [-name 模式]' },
    touch: { description: '创建空文件', usage: 'touch 文件...' },
    mkdir: { description: '创建目录', usage: 'mkdir [-p] 目录...' },
    rm: { description: '删除文件或目录', usage: 'rm [-rf] 路径...' },
    echo: { description: '打印文本', usage: 'echo [文本...]' },
    grep: { description: '搜索匹配的行', usage: 'grep 模式 [文件...]' },
    sort: { description: '排序', usage: 'sort [-r] [文件...]' },
    uniq: { description: '折叠相邻的重复行', usage: 'uniq [-c] [文件...]' },
    help: { description: '列出可用命令', usage: 'help' },
    man: { description: '查看命令用法', usage: 'man 命令' },
    whoami: { description: '显示当前用户', usage: 'whoami' },
    uname: { description: '显示系统信息', usage: 'uname [-a]' },
    date: { description: '显示当前日期时间', usage: 'date' },
    env: { description: '列出环境变量', usage: 'env' },
    export: { description: '设置环境变量', usage: 'export 名称=值' },
    which: { description: '定位命令', usage: 'which 命令' },
    history: { description: '显示命令历史', usage: 'history' },
    clear: { description: '清屏', usage: 'clear' },
    theme: { description: '查看或切换配色主题', usage: 'theme [主题名]' },
    lang: { description: '查看或切换界面语言', usage: 'lang [en|zh]' },
    login: { description: '用 Google 账号登录', usage: 'login' },
    logout: { description: '退出登录', usage: 'logout' },
    about: { description: '关于我', usage: 'about' },
    contact: { description: '联系方式', usage: 'contact' },
    projects: { description: '我做过的项目', usage: 'projects' },
    skills: { description: '技术栈', usage: 'skills' },
    resume: { description: '一页式简历', usage: 'resume' },
    open: { description: '在新标签页打开链接', usage: 'open https://...' },
    ask: {
      description: '和我聊聊（浏览器本地模型）',
      usage: 'ask [--status] [问题...]\n  ask            进入对话模式，exit、Ctrl+D 或空闲时 Ctrl+C 退出\n  ask <问题>      一次性问答',
    },
  },
}

/** 查不到返回空对象，调用方据此回落到 Process 自带字段。 */
export function commandText(name: string, lang: Lang): Text {
  return TABLE[lang][name] ?? {}
}
