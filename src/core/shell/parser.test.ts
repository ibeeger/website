import { describe, it, expect } from 'vitest'
import { lex, ShellSyntaxError, type Word } from './lexer'
import { parse } from './parser'

/** 从 Word 还原字面量，便于断言 */
const flat = (w: Word) => w.map(p => p.text).join('')
const argvOf = (cmd: { argv: Word[] }) => cmd.argv.map(flat)

describe('parse 单命令', () => {
  it('产出一项、一条 pipeline、一个命令', () => {
    const ast = parse(lex('ls -la'))
    expect(ast.items).toHaveLength(1)
    expect(ast.items[0]!.pipeline.commands).toHaveLength(1)
    expect(argvOf(ast.items[0]!.pipeline.commands[0]!)).toEqual(['ls', '-la'])
    expect(ast.items[0]!.joinNext).toBeNull()
  })

  it('空输入产出空 items', () => {
    expect(parse(lex('')).items).toEqual([])
  })
})

describe('parse 管道', () => {
  it('三段管道产出三个命令', () => {
    const ast = parse(lex('cat a | grep b | wc -l'))
    const cmds = ast.items[0]!.pipeline.commands
    expect(cmds.map(argvOf)).toEqual([['cat', 'a'], ['grep', 'b'], ['wc', '-l']])
  })
})

describe('parse 重定向', () => {
  it('> 记为 fd1 write', () => {
    const cmd = parse(lex('echo x > out.txt')).items[0]!.pipeline.commands[0]!
    expect(argvOf(cmd)).toEqual(['echo', 'x'])
    expect(cmd.redirects).toHaveLength(1)
    expect(cmd.redirects[0]!.fd).toBe(1)
    expect(cmd.redirects[0]!.mode).toBe('write')
    expect(flat(cmd.redirects[0]!.target)).toBe('out.txt')
  })

  it('>> 记为 append', () => {
    const cmd = parse(lex('echo x >> out.txt')).items[0]!.pipeline.commands[0]!
    expect(cmd.redirects[0]!.mode).toBe('append')
  })

  it('2> 记为 fd2', () => {
    const cmd = parse(lex('cmd 2> err.txt')).items[0]!.pipeline.commands[0]!
    expect(cmd.redirects[0]!.fd).toBe(2)
  })

  it('重定向可以出现在参数中间', () => {
    const cmd = parse(lex('echo > out.txt hello')).items[0]!.pipeline.commands[0]!
    expect(argvOf(cmd)).toEqual(['echo', 'hello'])
    expect(cmd.redirects).toHaveLength(1)
  })

  it('重定向缺目标时报错', () => {
    expect(() => parse(lex('echo x >'))).toThrow(ShellSyntaxError)
  })
})

describe('parse 命令列表', () => {
  it('记录连接下一项的操作符', () => {
    const ast = parse(lex('a && b || c ; d'))
    expect(ast.items.map(i => i.joinNext)).toEqual(['&&', '||', ';', null])
    expect(ast.items.map(i => argvOf(i.pipeline.commands[0]!))).toEqual([['a'], ['b'], ['c'], ['d']])
  })

  it('末尾的分号是合法的', () => {
    const ast = parse(lex('ls ;'))
    expect(ast.items).toHaveLength(1)
    expect(ast.items[0]!.joinNext).toBe(';')
  })
})

describe('parse 语法错误', () => {
  it('以管道开头', () => {
    expect(() => parse(lex('| ls'))).toThrow(/unexpected token/)
  })

  it('以管道结尾', () => {
    expect(() => parse(lex('ls |'))).toThrow(/unexpected token/)
  })

  it('连续两个管道', () => {
    expect(() => parse(lex('ls || | wc'))).toThrow(/unexpected token/)
  })

  it('以 && 结尾', () => {
    expect(() => parse(lex('ls &&'))).toThrow(/unexpected token/)
  })
})
