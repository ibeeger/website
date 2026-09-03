import type { Ctx } from '../process'
import type { Word } from './lexer'
import { basename, dirname } from '../vfs/path'

const VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)|\$\?/g

function expandVars(s: string, ctx: Ctx): string {
  return s.replace(VAR_RE, (match, braced?: string, bare?: string) => {
    if (match === '$?') return String(ctx.lastExitCode)
    const name = braced ?? bare!
    return ctx.env.get(name) ?? ''
  })
}

/** 把 glob 模式转成正则。只转义正则元字符，* 和 ? 保留为通配。 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

/**
 * 对路径的最后一段求 glob。
 * 限制（刻意）：
 * 1. 只对整个 word 全部为未引用段的情况生效（由调用方 expandWord 保证），
 *    且只对路径的最后一段求值 —— `*` + `/` + `*.ts` 这类跨层模式不支持。
 * 2. 无匹配时由调用方保留模式原样，与 bash 默认行为一致。
 * 3. `*` 不匹配以 `.` 开头的隐藏文件，除非模式本身以 `.` 开头。
 */
function glob(pattern: string, ctx: Ctx): string[] {
  const base = basename(pattern)
  if (!/[*?]/.test(base)) return []

  const dir = dirname(pattern)
  const absDir = ctx.vfs.resolve(ctx.cwd, dir === '.' ? '.' : dir)

  let entries
  try {
    entries = ctx.vfs.list(absDir)
  } catch {
    return []
  }

  const re = patternToRegex(base)
  const includeHidden = base.startsWith('.')
  return entries
    .filter(e => (includeHidden || !e.name.startsWith('.')) && re.test(e.name))
    .map(e => (dir === '.' ? e.name : `${dir}/${e.name}`))
    .sort()
}

/**
 * 展开一个 word 为零到多个实参。
 * 顺序：变量展开 → 波浪号展开 → glob。引号段跳过全部三项。
 */
export function expandWord(word: Word, ctx: Ctx): string[] {
  if (word.length === 0) return ['']

  const allUnquoted = word.every(p => p.quote === 'none')

  let s = ''
  for (const part of word) {
    s += part.quote === 'single' ? part.text : expandVars(part.text, ctx)
  }

  if (allUnquoted && (s === '~' || s.startsWith('~/'))) {
    s = (ctx.env.get('HOME') ?? '/') + s.slice(1)
  }

  if (allUnquoted && /[*?]/.test(s)) {
    const matches = glob(s, ctx)
    if (matches.length > 0) return matches      // 无匹配时保留原样，同 bash
  }

  return [s]
}
