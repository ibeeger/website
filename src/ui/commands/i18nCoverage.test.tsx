// 这条测试横跨 commands 与 ui 两层 —— 它要同时枚举 src/commands 与 src/ui/commands
// 下的全部非 hidden 命令。放在 ui 侧才能名正言顺地 import 两边：src/commands/
// 按项目约束不该运行时依赖 React，即便 ESLint 的 no-restricted-imports 只按
// 模块名匹配、拦不住经由本文件的传递性引入，也不该在那一侧开这个口子。
import { it, expect } from 'vitest'
import { builtins } from '../../commands'
import { uiCommands } from './index'
import { commandText } from '../../i18n/commandMeta'

it('翻译表覆盖了全部非 hidden 命令 —— 漏一个就会在 help 里露出另一种语言', () => {
  const visible = [...builtins, ...uiCommands].filter(p => !p.hidden).map(p => p.name)
  const missing = { en: [] as string[], zh: [] as string[] }
  for (const lang of ['en', 'zh'] as const) {
    for (const name of visible) {
      if (commandText(name, lang).description === undefined) missing[lang].push(name)
    }
  }
  expect(missing).toEqual({ en: [], zh: [] })
})

// description 与 usage 各有各的回落，缺一个不会连累另一个：只写 description 的
// 条目照样过上面那条，而 man 会在英文界面上打出 Process 自带的中文 usage ——
// 一半英文一半中文，CI 全绿。两个字段必须同等地钉住。
it('翻译表同样覆盖了全部非 hidden 命令的 usage —— 只补 description 会让 man 回落到 Process 自带的那份', () => {
  const visible = [...builtins, ...uiCommands].filter(p => !p.hidden).map(p => p.name)
  const missing = { en: [] as string[], zh: [] as string[] }
  for (const lang of ['en', 'zh'] as const) {
    for (const name of visible) {
      if (commandText(name, lang).usage === undefined) missing[lang].push(name)
    }
  }
  expect(missing).toEqual({ en: [], zh: [] })
})
