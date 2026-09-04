import type { Chunk } from '../core/process'
import type { ChatPhase } from './chat/useChat'

export type Block = {
  id: string
  prompt: string
  input: string
  chunks: Chunk[]
  exitCode: number | null
  // 以下仅对话模式使用。普通命令 block 不带这些字段，渲染路径完全不变。
  kind?: 'chat'
  phase?: ChatPhase
  error?: string
  interrupted?: boolean
}
