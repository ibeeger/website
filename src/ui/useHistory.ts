import { useCallback, useRef } from 'react'

/**
 * bash 风格的历史导航。
 * 游标为 entries.length 表示「不在历史中」，此时显示用户的草稿。
 */
export function useHistory(entries: string[]) {
  const cursor = useRef(entries.length)
  const draft = useRef('')

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
