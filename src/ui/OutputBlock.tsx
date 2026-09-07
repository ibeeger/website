import { ChunkView } from './ChunkView'
import { ErrorBoundary } from './ErrorBoundary'
import { Thinking } from './chat/Thinking'
import { chunkToText } from '../core/process'
import type { Lang } from '../i18n/lang'
import { UI_TEXT } from '../i18n/uiText'
import type { Block } from './types'

/** node chunk 渲染失败时的兜底：退回它自己的 toText()，标红显示。 */
function chunkFallback(c: Parameters<typeof chunkToText>[0]) {
  let text: string
  try { text = chunkToText(c) } catch { text = '[渲染失败]' }
  return <span className="t-red">{text}</span>
}

export function OutputBlock({ block, lang }: { block: Block; lang: Lang }) {
  const isChat = block.kind === 'chat'
  return (
    <div
      className={isChat ? 'block block-chat' : 'block'}
      // 流式期间整块标记为忙。投影把一整轮的文本压成一个 chunk，于是每来一个
      // 分片都是「整体替换同一个文本节点」；外层 live region 的 aria-relevant
      // 默认含 text，这种替换会被当成新增，读屏就把越来越长的整段回答重播一遍
      // ——50 个分片就是 50 次逐次变长的播报。aria-busy 让辅助技术等到这一轮
      // 结束（phase 回 idle、属性摘掉）再一次性播报。
      // 只在 streaming 时加：thinking 阶段的播报由 Thinking 自己那层 aria-busy
      // 管，把它也裹进来会让「思考中」也发不出去。
      {...(isChat && block.phase === 'streaming' ? { 'aria-busy': true } : {})}
    >
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
      {isChat && block.phase === 'thinking' && <Thinking lang={lang} />}
      {isChat && block.interrupted === true && <div className="t-dim">{UI_TEXT[lang].interrupted}</div>}
      {isChat && block.error !== undefined && <div className="t-red">ask: {block.error}</div>}
    </div>
  )
}
