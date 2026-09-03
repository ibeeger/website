import type { Chunk } from '../core/process'

export type Block = {
  id: string
  prompt: string
  input: string
  chunks: Chunk[]
  exitCode: number | null
}
