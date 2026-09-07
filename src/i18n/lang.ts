import type { Lang } from '../core/process'

// Lang 本身定义在 core/process：Host 契约要用它，而 src/core/ 不该反向依赖 src/i18n/。
// 这里 re-export，让 UI 与命令层有一个语言相关常量的统一入口。
export type { Lang }

export const LANGS: readonly Lang[] = ['en', 'zh']
export const DEFAULT_LANG: Lang = 'en'
export const LANG_STORAGE_KEY = 'terminal-lang'
