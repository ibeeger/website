import type { ReactNode } from 'react'
import type { VFS } from './vfs/vfs'
import type { AiProvider } from './ai/languageModel'

export type Style = {
  color?: string      // 语义色名（'red' | 'green' | 'blue' | 'dim' ...），映射到主题 CSS 变量
  bold?: boolean
  dim?: boolean
  underline?: boolean
}

export type Chunk =
  | { type: 'text'; text: string; style?: Style }
  | { type: 'node'; node: ReactNode; toText: () => string }

export interface Writer {
  write(chunk: Chunk): void
  writeText(text: string, style?: Style): void
  writeLine(text: string, style?: Style): void
  close(): void
}

export interface IO {
  argv: string[]
  stdin: AsyncIterable<Chunk> | null
  stdout: Writer
  stderr: Writer
}

export interface Host {
  clear(): void
  setTheme(name: string): void
  listThemes(): string[]
  currentTheme(): string
  /** 请求 UI 进入对话模式。命令调用后立即返回，不等待模式结束。 */
  enterChat(opts: { systemPrompt: string }): void
}

export interface Env {
  get(name: string): string | undefined
  set(name: string, value: string): void
  unset(name: string): void
  all(): Record<string, string>
}

export interface Registry {
  register(p: Process): void
  get(name: string): Process | undefined
  list(): Process[]
}

export interface Ctx {
  cwd: string                    // 可变：cd 修改它
  lastExitCode: number           // 可变：$? 读取它
  history: string[]              // 可变：history 命令读取它
  readonly env: Env
  readonly vfs: VFS
  readonly registry: Registry
  readonly host: Host
  readonly ai: AiProvider        // 浏览器内置模型，见 core/ai/languageModel
  readonly signal: AbortSignal   // Ctrl+C
}

export interface Process {
  name: string
  description: string
  usage?: string
  hidden?: boolean          // 为真时不出现在 help 列表中（彩蛋命令用）
  complete?(argv: string[], ctx: Ctx): string[]
  run(io: IO, ctx: Ctx): Promise<number>
}

// ---- chunk 构造器 ----

export function text(s: string, style?: Style): Chunk {
  return style ? { type: 'text', text: s, style } : { type: 'text', text: s }
}

export function line(s: string, style?: Style): Chunk {
  return text(s + '\n', style)
}

export function node(n: ReactNode, toText: () => string): Chunk {
  return { type: 'node', node: n, toText }
}

/** 把任意 chunk 降级为纯文本 —— 管道与重定向的下游只认文本。 */
export function chunkToText(c: Chunk): string {
  return c.type === 'text' ? c.text : c.toText()
}

export type { VFS } from './vfs/vfs'
export type { AiProvider, AiSession, AiStatus } from './ai/languageModel'
