import { ChunkView } from './ChunkView'
import { ErrorBoundary } from './ErrorBoundary'
import { Thinking } from './chat/Thinking'
import { chunkToText } from '../core/process'
import type { Block } from './types'

/** node chunk 渲染失败时的兜底：退回它自己的 toText()，标红显示。 */
function chunkFallback(c: Parameters<typeof chunkToText>[0]) {
  let text: string
  try { text = chunkToText(c) } catch { text = '[渲染失败]' }
  return <span className="t-red">{text}</span>
}

export function OutputBlock({ block }: { block: Block }) {
  const isChat = block.kind === 'chat'
  return (
    <div className={isChat ? 'block block-chat' : 'block'}>
      <div className="block-input">
        <span className="prompt">{block.prompt}</span>
        <span>{block.input}</span>
      </div>
      {block.chunks.length > 0 && (
        <div className="block-output">
          {block.chunks.map((c, i) => (
            <ErrorBoundary key={i} fallback={() => chunkFallback(c)}>
              <ChunkView chunk={c} />
            </ErrorBoundary>
          ))}
        </div>
      )}
      {isChat && block.phase === 'thinking' && <Thinking />}
      {isChat && block.interrupted === true && <div className="t-dim">^C 已中断</div>}
      {isChat && block.error !== undefined && <div className="t-red">ask: {block.error}</div>}
    </div>
  )
}
