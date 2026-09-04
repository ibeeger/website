import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// testing-library 的自动清理只在检测到全局 afterEach 时才自我注册，
// 而本项目所有测试文件都显式导入 vitest API。与其为一个局部需求打开 globals，
// 不如在这里显式卸载上一次 render —— 同一文件里多次 render 时缺了它会互相污染。
//
// 有意不接进 vitest.config.ts 的全局 setupFiles：那样会让每一个测试文件
// （包括 ~20 个纯 Node、零 DOM 依赖的 core 单测）都transitively 引入
// @testing-library/react，进而引入 react-dom —— "core 可以在纯 Node 里
// 单测" 这条卖点会从"代码真的做得到"退化成"代码做得到，但套件已经不再
// 证明这件事"。改为由每个用到 jsdom 的测试文件自己显式
// `import '<relative>/test-setup'`（副作用导入）来注册这个 afterEach，
// 精确圈定到真正渲染过 DOM 的文件，不依赖目录约定（比如 src/App.test.tsx
// 就不在 src/ui/ 目录下，一个基于目录 glob 的 Vitest project 切分反而会漏掉它）。
afterEach(cleanup)
