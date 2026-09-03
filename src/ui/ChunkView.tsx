import type { Chunk, Style } from '../core/process'

function classesFor(style: Style): string {
  const cs: string[] = []
  if (style.color) cs.push(`t-${style.color}`)
  if (style.bold) cs.push('t-bold')
  if (style.dim) cs.push('t-dim')
  if (style.underline) cs.push('t-underline')
  return cs.join(' ')
}

export function ChunkView({ chunk }: { chunk: Chunk }) {
  if (chunk.type === 'node') return <>{chunk.node}</>
  if (!chunk.style) return <>{chunk.text}</>
  return <span className={classesFor(chunk.style)}>{chunk.text}</span>
}
