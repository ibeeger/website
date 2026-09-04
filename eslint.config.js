import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // 架构边界的机械强制：core 与 commands 不得运行时依赖 React。
    // glob 必须覆盖 .tsx——React 只能通过 .tsx 文件混进这两棵树，纯 .ts
    // 文件里写不出 JSX，光挡 .ts 等于只守住了不可能发生的那一半。
    files: ['src/core/**/*.{ts,tsx}', 'src/commands/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [
          { name: 'react', allowTypeImports: true,
            message: 'core/commands 是纯 TS 层，只允许 import type { ReactNode } from "react"。' },
          { name: 'react-dom', allowTypeImports: true,
            message: 'core/commands 不得依赖 react-dom。' },
        ],
      }],
    },
  },
)
