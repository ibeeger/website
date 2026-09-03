import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// testing-library 的自动清理只在检测到全局 afterEach 时才自我注册，
// 而本项目所有测试文件都显式导入 vitest API。与其为一个局部需求打开 globals，
// 不如在这里显式卸载上一次 render —— 同一文件里多次 render 时缺了它会互相污染。
afterEach(cleanup)
