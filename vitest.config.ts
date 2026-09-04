import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // 不在这里接 setupFiles：那会让每个测试文件（包括 ~20 个纯 Node、零 DOM
    // 依赖的 core 单测）都 transitively 引入 @testing-library/react 与
    // react-dom，"core 可以在纯 Node 里单测" 这条卖点就从「代码真的做得到」
    // 退化成「代码做得到，但套件不再证明这件事」。改由每个用到 jsdom 的
    // 测试文件自己 `import '<相对路径>/test-setup'`，见该文件顶部注释。
  },
})
