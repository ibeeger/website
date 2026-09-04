/**
 * 把 glob 模式转成正则。只转义正则元字符，`*` 和 `?` 保留为通配。
 *
 * 唯一实现：expand.ts（shell 里 `*.md` 这类未加引号 word 的展开）与
 * commands/fs/find.ts（`find -name` 的匹配）此前各自复制了一份字节相同的
 * 实现，并各自留了一句「必须与另一处保持同步」的注释——这正是 splitLines
 * 被集中到一处的同一类失败模式：改一处会静默破坏另一处的一致性。
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}
