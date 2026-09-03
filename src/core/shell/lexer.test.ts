import { describe, it, expect } from 'vitest'
import { lex, ShellSyntaxError, type Token } from './lexer'

/** 便于断言：把 token 压成可读形式 */
function shape(tokens: Token[]) {
  return tokens.map(t =>
    t.type === 'op' ? `op:${t.value}` : `word:${t.parts.map(p => `${p.quote}(${p.text})`).join('+')}`,
  )
}

describe('lex 基础', () => {
  it('按空白切分单词', () => {
    expect(shape(lex('ls -la'))).toEqual(['word:none(ls)', 'word:none(-la)'])
  })

  it('折叠连续空白', () => {
    expect(shape(lex('  ls   -la  '))).toEqual(['word:none(ls)', 'word:none(-la)'])
  })

  it('空输入产出空 token 列表', () => {
    expect(lex('')).toEqual([])
    expect(lex('   ')).toEqual([])
  })
})

describe('lex 引号', () => {
  it('双引号内空格不切分，且标记为 double', () => {
    expect(shape(lex('echo "hello world"')))
      .toEqual(['word:none(echo)', 'word:double(hello world)'])
  })

  it('单引号标记为 single', () => {
    expect(shape(lex("echo 'a b'")))
      .toEqual(['word:none(echo)', 'word:single(a b)'])
  })

  it('相邻的不同引号拼成同一个单词的多个段', () => {
    expect(shape(lex(`echo a"b"'c'`)))
      .toEqual(['word:none(echo)', 'word:none(a)+double(b)+single(c)'])
  })

  it('空引号也产生一个参数', () => {
    const tokens = lex("echo ''")
    expect(tokens).toHaveLength(2)
    expect(tokens[1]).toEqual({ type: 'word', parts: [{ text: '', quote: 'single' }] })
  })

  it('未闭合的单引号报错', () => {
    expect(() => lex("echo 'abc")).toThrow(ShellSyntaxError)
  })

  it('未闭合的双引号报错', () => {
    expect(() => lex('echo "abc')).toThrow(ShellSyntaxError)
  })
})

describe('lex 转义', () => {
  it('反斜杠转义的字符不参与展开（记为 single）', () => {
    expect(shape(lex('echo a\\ b')))
      .toEqual(['word:none(echo)', 'word:none(a)+single( )+none(b)'])
  })

  it('双引号内 \\$ 转义为字面 $', () => {
    expect(shape(lex('echo "\\$HOME"')))
      .toEqual(['word:none(echo)', 'word:double($HOME)'])
  })

  it('行尾单个反斜杠报错', () => {
    expect(() => lex('echo a\\')).toThrow(ShellSyntaxError)
  })
})

describe('lex 操作符', () => {
  it('识别管道', () => {
    expect(shape(lex('cat a | grep b')))
      .toEqual(['word:none(cat)', 'word:none(a)', 'op:|', 'word:none(grep)', 'word:none(b)'])
  })

  it('区分 > 与 >>', () => {
    expect(shape(lex('echo x > a'))).toContain('op:>')
    expect(shape(lex('echo x >> a'))).toContain('op:>>')
  })

  it('在单词起始处识别 2>', () => {
    expect(shape(lex('cmd 2> err')))
      .toEqual(['word:none(cmd)', 'op:2>', 'word:none(err)'])
  })

  it('单词中间的 2> 不当作重定向', () => {
    expect(shape(lex('file2>out')))
      .toEqual(['word:none(file2)', 'op:>', 'word:none(out)'])
  })

  it('识别 && || ;', () => {
    expect(shape(lex('a && b || c ; d')))
      .toEqual(['word:none(a)', 'op:&&', 'word:none(b)', 'op:||',
                'word:none(c)', 'op:;', 'word:none(d)'])
  })

  it('操作符不需要两侧空格', () => {
    expect(shape(lex('a|b'))).toEqual(['word:none(a)', 'op:|', 'word:none(b)'])
  })

  it('引号内的操作符是普通字符', () => {
    expect(shape(lex('echo "a | b"')))
      .toEqual(['word:none(echo)', 'word:double(a | b)'])
  })

  it('后台任务符号 & 明确不支持', () => {
    expect(() => lex('sleep 1 &')).toThrow(ShellSyntaxError)
  })
})
