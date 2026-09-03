import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // @testing-library/react 的自动清理（afterEach 卸载上一个测试渲染出的 DOM）
    // 依赖全局 afterEach 存在；不开 globals 的话它检测不到，同一文件里多次
    // render() 就会互相污染（典型症状：getByRole 命中多个元素）。
    globals: true,
  },
})
