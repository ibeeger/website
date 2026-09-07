// @vitest-environment jsdom
// 这条测试要枚举 src/ui/commands 下的命令（.tsx，会拉进 React），放不进纯 Node
// 环境的 src/commands/sys/sys.test.ts —— 见 task-5-brief.md 的回退方案。
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
