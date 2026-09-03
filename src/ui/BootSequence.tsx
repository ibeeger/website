import { useEffect, useRef, useState } from 'react'

export const BOOT_STORAGE_KEY = 'terminal-booted'
const LINE_DELAY_MS = 90

function shouldSkip(): boolean {
  try {
    if (sessionStorage.getItem(BOOT_STORAGE_KEY) === '1') return true
  } catch { /* 隐私模式下读取可能抛异常，按未播放处理 */ }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function BootSequence({ lines, onDone }: { lines: string[]; onDone(): void }) {
  const [shown, setShown] = useState(() => (shouldSkip() ? lines.length : 0))
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setShown(lines.length)
    try { sessionStorage.setItem(BOOT_STORAGE_KEY, '1') } catch { /* 忽略 */ }
    onDone()
  }

  // 已跳过时立即完成
  useEffect(() => {
    if (shown >= lines.length) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 逐行推进
  useEffect(() => {
    if (doneRef.current || shown >= lines.length) return
    const t = setTimeout(() => setShown(n => n + 1), LINE_DELAY_MS)
    return () => clearTimeout(t)
  }, [shown, lines.length])

  // 全部显示完毕
  useEffect(() => {
    if (shown >= lines.length) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  // 任意按键跳过
  useEffect(() => {
    const onKey = () => finish()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="boot" aria-hidden="true">
      {lines.slice(0, shown).map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}
