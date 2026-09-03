import { ShellSyntaxError, type Token, type Word } from './lexer'

export type Redirect = { fd: 1 | 2; mode: 'write' | 'append'; target: Word }
export type Command = { argv: Word[]; redirects: Redirect[] }
export type Pipeline = { commands: Command[] }
export type Item = { pipeline: Pipeline; joinNext: ';' | '&&' | '||' | null }
export type Ast = { items: Item[] }

export function parse(tokens: Token[]): Ast {
  const items: Item[] = []
  let commands: Command[] = []
  let argv: Word[] = []
  let redirects: Redirect[] = []

  const closeCommand = (near: string) => {
    if (argv.length === 0 && redirects.length === 0) {
      throw new ShellSyntaxError(`syntax error near unexpected token \`${near}'`)
    }
    commands.push({ argv, redirects })
    argv = []
    redirects = []
  }

  const closePipeline = (join: Item['joinNext'], near: string) => {
    closeCommand(near)
    items.push({ pipeline: { commands }, joinNext: join })
    commands = []
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!

    if (t.type === 'word') {
      argv.push(t.parts)
      continue
    }

    if (t.value === '|') {
      closeCommand('|')
      continue
    }

    if (t.value === ';' || t.value === '&&' || t.value === '||') {
      closePipeline(t.value, t.value)
      continue
    }

    // 重定向：吃掉下一个 word 作为目标
    const next = tokens[i + 1]
    if (!next || next.type !== 'word') {
      throw new ShellSyntaxError("syntax error near unexpected token `newline'")
    }
    redirects.push({
      fd: t.value === '2>' ? 2 : 1,
      mode: t.value === '>>' ? 'append' : 'write',
      target: next.parts,
    })
    i++
  }

  if (argv.length > 0 || redirects.length > 0 || commands.length > 0) {
    closePipeline(null, 'newline')
  } else if (items.length > 0) {
    // 输入以 && / || 结尾：那一项已经在循环里被 closePipeline 关闭并 reset 了
    // argv/redirects/commands，所以上面的条件看不到任何残留 —— 必须单独校验
    // 最后一项的 joinNext 不是需要下一项的连接符。末尾的 `;` 是合法的（bash 允许），
    // 但末尾的 `&&` / `||` 不是（后面没有东西可连）。
    const last = items[items.length - 1]!
    if (last.joinNext === '&&' || last.joinNext === '||') {
      throw new ShellSyntaxError("syntax error near unexpected token `newline'")
    }
  }

  return { items }
}
