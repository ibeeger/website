import { useCallback } from 'react'

type CompleteFn = (line: string) => { candidates: string[]; replaceFrom: number }

/** 求一组字符串的最长公共前缀。 */
function commonPrefix(items: string[]): string {
  if (items.length === 0) return ''
  let prefix = items[0]!
  for (const s of items.slice(1)) {
    let i = 0
    while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++
    prefix = prefix.slice(0, i)
  }
  return prefix
}

/**
 * 返回补全后的整行，以及需要展示给用户的候选列表（唯一候选时为空）。
 * 与 bash 一致：唯一候选补一个空格，目录候选已自带斜杠故不补空格。
 */
export function useCompletion(complete: CompleteFn) {
  return useCallback((line: string): { line: string; hint: string[] } => {
    const { candidates, replaceFrom } = complete(line)
    if (candidates.length === 0) return { line, hint: [] }

    const head = line.slice(0, replaceFrom)

    if (candidates.length === 1) {
      const only = candidates[0]!
      const suffix = only.endsWith('/') ? '' : ' '
      return { line: head + only + suffix, hint: [] }
    }

    const shared = commonPrefix(candidates)
    const frag = line.slice(replaceFrom)
    // 公共前缀没能推进时，直接把候选列出来
    return { line: shared.length > frag.length ? head + shared : line, hint: candidates }
  }, [complete])
}
