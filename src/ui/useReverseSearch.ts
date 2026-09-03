import { useCallback, useState } from 'react'

/**
 * bash 的 Ctrl+R：从最新一条往回搜第一个包含查询子串的历史命令。
 * skip 记录已经跳过的匹配数，再按一次 Ctrl+R 就多跳一条。
 */
export function useReverseSearch(entries: string[]) {
  const [active, setActive] = useState(false)
  const [query, setQuery] = useState('')
  const [skip, setSkip] = useState(0)

  const findMatch = useCallback((q: string, s: number): string => {
    if (q === '') return ''
    let seen = 0
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!
      if (!entry.includes(q)) continue
      if (seen === s) return entry
      seen++
    }
    return ''
  }, [entries])

  const match = findMatch(query, skip)

  return {
    active,
    query,
    match,
    start: useCallback(() => { setActive(true); setQuery(''); setSkip(0) }, []),
    type: useCallback((q: string) => { setQuery(q); setSkip(0) }, []),
    // 没有更旧的匹配时原地不动，而不是回绕到最新一条
    next: useCallback(() => {
      setSkip(s => (findMatch(query, s + 1) === '' ? s : s + 1))
    }, [findMatch, query]),
    accept: useCallback(() => {
      setActive(false)
      const result = match
      setQuery('')
      setSkip(0)
      return result
    }, [match]),
    cancel: useCallback(() => { setActive(false); setQuery(''); setSkip(0) }, []),
  }
}
