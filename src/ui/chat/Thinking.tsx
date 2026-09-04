import { useEffect, useState } from 'react'

const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80

/**
 * 等待期间的反馈。计时从第一帧就开始累计但一秒后才显示：
 * 首次唤醒本地模型确实要几秒，把耗时摆出来比让用户猜「是不是卡死了」要好；
 * 但对已经预热的模型，秒数一闪而过反而是噪音。
 */
export function Thinking() {
  const [frame, setFrame] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const spin = setInterval(() => setFrame(f => f + 1), FRAME_MS)
    const clock = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => { clearInterval(spin); clearInterval(clock) }
  }, [])

  return (
    <div className="chat-thinking" aria-busy="true" aria-live="polite">
      <span className="chat-spinner" aria-hidden="true">{DOTS[frame % DOTS.length]}</span>
      <span>思考中{elapsed > 0 ? ` ${elapsed}s` : ''}</span>
    </div>
  )
}
