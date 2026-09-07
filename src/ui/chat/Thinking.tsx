import { useEffect, useState } from 'react'
import type { Lang } from '../../i18n/lang'
import { UI_TEXT } from '../../i18n/uiText'

const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80

/**
 * 等待期间的反馈。计时从第一帧就开始累计但一秒后才显示：
 * 首次唤醒本地模型确实要几秒，把耗时摆出来比让用户猜「是不是卡死了」要好；
 * 但对已经预热的模型，秒数一闪而过反而是噪音。
 */
export function Thinking({ lang }: { lang: Lang }) {
  const [frame, setFrame] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const spin = setInterval(() => setFrame(f => f + 1), FRAME_MS)
    const clock = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => { clearInterval(spin); clearInterval(clock) }
  }, [])

  return (
    // aria-live 特意不放在这里：Terminal.tsx 已经用一个 aria-live="polite"
    // 包住了所有 block，这里再加一层会让同一次更新被读屏播报两遍；
    // 每秒变化的秒数则整段塞进 aria-hidden，让外层 live region 捕捉到的
    // 可访问文本永远是「思考中」，只播报一次——秒数只服务视觉用户。
    <div className="chat-thinking" aria-busy="true">
      <span className="chat-spinner" aria-hidden="true">{DOTS[frame % DOTS.length]}</span>
      <span>{UI_TEXT[lang].thinking}</span>
      {elapsed > 0 && <span aria-hidden="true"> {elapsed}s</span>}
    </div>
  )
}
