import { ChunkView } from './ChunkView'
import type { Block } from './types'

export function OutputBlock({ block }: { block: Block }) {
  return (
    <div className="block">
      <div className="block-input">
        <span className="prompt">{block.prompt}</span>
        <span>{block.input}</span>
      </div>
      {block.chunks.length > 0 && (
        <div className="block-output">
          {block.chunks.map((c, i) => <ChunkView key={i} chunk={c} />)}
        </div>
      )}
    </div>
  )
}
