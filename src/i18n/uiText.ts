import type { Lang } from '../core/process'

/**
 * React 渲染层自己的文案 —— 终端外壳上那些不经过命令、也不经过内容文件的字。
 * 和 i18n/messages.ts 的分工是：那边是命令跑起来打到 scrollback 里的话，
 * 这边是壳本身说的话（可访问名、思考指示器、中断标记、崩溃兜底页）。
 *
 * 单独成文件是有代价换来的：本分支把 <html lang> 从 zh-CN 改成了 en，
 * 于是所有留在 JSX 里的中文 aria-label 会被读屏用英文音系去念，等于噪音。
 * 谁新写一个可见字符串或可访问名，都该先在这里落一份两种语言的，
 * 而不是在组件里写死。
 */
export interface UiText {
  /** role="application" 容器的可访问名。 */
  terminalLabel: string
  /** shell 下输入框的可访问名。 */
  commandInput: string
  /** 对话模式下输入框的可访问名 —— 必须带上退出方式。 */
  chatInput: string
  /** 等待模型时的可见提示。 */
  thinking: string
  /** 一轮对话被 Ctrl+C 打断后留在 scrollback 里的标记。 */
  interrupted: string
  /** 根 ErrorBoundary 的兜底文案。 */
  crash: string
}

export const UI_TEXT: Record<Lang, UiText> = {
  en: {
    terminalLabel: 'Interactive terminal',
    commandInput: 'Terminal command input',
    chatInput: 'Chat mode input, type exit or press Ctrl+D to leave',
    thinking: 'Thinking',
    interrupted: '^C interrupted',
    crash: 'Something went wrong. Please refresh the page.',
  },
  zh: {
    terminalLabel: '交互式终端',
    commandInput: '终端命令输入',
    chatInput: '对话模式输入，exit 或 Ctrl+D 退出',
    thinking: '思考中',
    interrupted: '^C 已中断',
    crash: '出错了，请刷新页面重试。',
  },
}
