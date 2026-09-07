// 这条测试横跨 commands 与 ui 两层 —— 它要同时枚举 src/commands 与 src/ui/commands
// 下的全部非 hidden 命令。放在 ui 侧才能名正言顺地 import 两边：src/commands/
// 按项目约束不该运行时依赖 React，即便 ESLint 的 no-restricted-imports 只按
// 模块名匹配、拦不住经由本文件的传递性引入，也不该在那一侧开这个口子。
import { it, expect } from 'vitest'
import { builtins } from '../../commands'
import { uiCommands } from './index'
import { commandText } from '../../i18n/commands'

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
