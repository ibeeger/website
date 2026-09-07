import { useCallback, useEffect, useRef } from 'react'

/**
 * bash 风格的历史导航。
 * 游标为 entries.length 表示「不在历史中」，此时显示用户的草稿。
 */
export function useHistory(entries: string[]) {
  const cursor = useRef(entries.length)
  const draft = useRef('')

  // 切换语言会重建内核，kernel.ctx.history 随之换成另一个数组。游标只在首次挂载
  // 求值，换完之后它还指着旧数组的长度 —— 第一次按 ↑ 取到越界下标，看起来就是
  // 「没反应」。数组换了就把游标放回新数组的末尾。
  useEffect(() => { cursor.current = entries.length }, [entries])

  const prev = useCallback((current: string) => {
    if (entries.length === 0) return current
    if (cursor.current === entries.length) draft.current = current
    cursor.current = Math.max(0, cursor.current - 1)
    return entries[cursor.current] ?? current
  }, [entries])

  const next = useCallback(() => {
    if (cursor.current >= entries.length) return draft.current
    cursor.current += 1
    if (cursor.current >= entries.length) return draft.current
    return entries[cursor.current] ?? ''
  }, [entries])

  const reset = useCallback(() => {
    cursor.current = entries.length
    draft.current = ''
  }, [entries])

  return { prev, next, reset }
}
