export type Quote = 'none' | 'single' | 'double'
export type WordPart = { text: string; quote: Quote }
export type Word = WordPart[]
export type Op = '|' | '>' | '>>' | '2>' | ';' | '&&' | '||'

export type Token =
  | { type: 'word'; parts: Word }
  | { type: 'op'; value: Op }

export class ShellSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShellSyntaxError'
  }
}

export function lex(input: string): Token[] {
  const tokens: Token[] = []
  let parts: Word = []
  let buf = ''
  let bufQuote: Quote = 'none'
  let touched = false        // 当前单词是否已开始（空引号也算开始）

  const flushPart = () => {
    // bufQuote !== 'none' 也要落段：空的引号（如 ''）没有字符，但仍是一个有效的段。
    if (buf !== '' || bufQuote !== 'none') {
      parts.push({ text: buf, quote: bufQuote })
      buf = ''
      bufQuote = 'none'
    }
  }

  const flushWord = () => {
    flushPart()
    if (parts.length > 0 || touched) {
      tokens.push({ type: 'word', parts })
      parts = []
    }
    touched = false
  }

  /** 切换引号语境前必须先把已积累的字符落成一个段 */
  const setQuote = (q: Quote) => {
    if (q !== bufQuote) {
      flushPart()
      bufQuote = q
    }
  }

  let i = 0
  while (i < input.length) {
    const c = input[i]!

    if (c === ' ' || c === '\t') {
      flushWord()
      i++
      continue
    }

    if (c === "'") {
      const end = input.indexOf("'", i + 1)
      if (end < 0) throw new ShellSyntaxError("unexpected EOF while looking for matching `''")
      setQuote('single')
      buf += input.slice(i + 1, end)
      touched = true
      i = end + 1
      continue
    }

    if (c === '"') {
      setQuote('double')
      touched = true
      i++
      let closed = false
      while (i < input.length) {
        const d = input[i]!
        if (d === '\\') {
          const n = input[i + 1]
          if (n === '"' || n === '\\' || n === '$') { buf += n; i += 2; continue }
          buf += '\\'; i++; continue
        }
        if (d === '"') { closed = true; i++; break }
        buf += d
        i++
      }
      if (!closed) throw new ShellSyntaxError('unexpected EOF while looking for matching `"\'')
      continue
    }

    if (c === '\\') {
      const n = input[i + 1]
      if (n === undefined) throw new ShellSyntaxError('unexpected EOF after `\\\'')
      setQuote('single')         // 转义结果不参与后续展开
      buf += n
      touched = true
      i += 2
      continue
    }

    const two = input.slice(i, i + 2)
    if (two === '&&' || two === '||' || two === '>>') {
      flushWord()
      tokens.push({ type: 'op', value: two })
      i += 2
      continue
    }
    if (two === '2>' && !touched) {
      flushWord()
      tokens.push({ type: 'op', value: '2>' })
      i += 2
      continue
    }
    if (c === '&') {
      throw new ShellSyntaxError('后台任务 `&` 不支持')
    }
    if (c === '|' || c === '>' || c === ';') {
      flushWord()
      tokens.push({ type: 'op', value: c })
      i++
      continue
    }

    setQuote('none')
    buf += c
    touched = true
    i++
  }

  flushWord()
  return tokens
}
