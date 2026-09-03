import { describe, it, expect, beforeEach } from 'vitest'
import { lex, type Word } from './lexer'
import { parse } from './parser'
import { createEnv } from './env'
import { expandWord } from './expand'
import { buildInitialVfs } from '../vfs/bootstrap'
import { createRegistry } from '../registry'
import type { Ctx, Host } from '../process'

const noopHost: Host = {
  clear() {}, setTheme() {}, listThemes() { return [] }, currentTheme() { return 'x' },
}

let ctx: Ctx

beforeEach(() => {
  ctx = {
    cwd: '/home/guest',
    lastExitCode: 0,
    history: [],
    env: createEnv({ HOME: '/home/guest', USER: 'guest' }),
    vfs: buildInitialVfs({
      '/home/guest/a.md': '', '/home/guest/b.md': '',
      '/home/guest/note.txt': '', '/home/guest/.hidden': '',
      '/home/guest/projects/p.md': '',
    }),
    registry: createRegistry(),
    host: noopHost,
    signal: new AbortController().signal,
  }
})

/** 取出一行命令里第 n 个参数的 Word */
function wordAt(line: string, n: number): Word {
  return parse(lex(line)).items[0]!.pipeline.commands[0]!.argv[n]!
}

describe('变量展开', () => {
  it('展开 $VAR', () => {
    expect(expandWord(wordAt('echo $USER', 1), ctx)).toEqual(['guest'])
  })

  it('展开 ${VAR}', () => {
    expect(expandWord(wordAt('echo ${USER}x', 1), ctx)).toEqual(['guestx'])
  })

  it('未定义的变量展开为空串', () => {
    expect(expandWord(wordAt('echo $NOPE', 1), ctx)).toEqual([''])
  })

  it('展开 $? 为上次退出码', () => {
    ctx.lastExitCode = 42
    expect(expandWord(wordAt('echo $?', 1), ctx)).toEqual(['42'])
  })

  it('双引号内展开变量', () => {
    expect(expandWord(wordAt('echo "hi $USER"', 1), ctx)).toEqual(['hi guest'])
  })

  it('单引号内不展开变量', () => {
    expect(expandWord(wordAt("echo '$USER'", 1), ctx)).toEqual(['$USER'])
  })

  it('同一个单词里引号与非引号段各按各的规则展开', () => {
    expect(expandWord(wordAt(`echo $USER'$USER'`, 1), ctx)).toEqual(['guest$USER'])
  })
})

describe('波浪号展开', () => {
  it('单独的 ~ 展开为 HOME', () => {
    expect(expandWord(wordAt('cd ~', 1), ctx)).toEqual(['/home/guest'])
  })

  it('~/ 前缀展开为 HOME', () => {
    expect(expandWord(wordAt('cat ~/a.md', 1), ctx)).toEqual(['/home/guest/a.md'])
  })

  it('引号内的 ~ 不展开', () => {
    expect(expandWord(wordAt('cat "~"', 1), ctx)).toEqual(['~'])
  })

  it('非前导位置的 ~ 不展开', () => {
    expect(expandWord(wordAt('echo a~b', 1), ctx)).toEqual(['a~b'])
  })
})

describe('glob 展开', () => {
  it('* 匹配当前目录下的多个文件并按字典序排列', () => {
    expect(expandWord(wordAt('ls *.md', 1), ctx)).toEqual(['a.md', 'b.md'])
  })

  it('? 匹配单个字符', () => {
    expect(expandWord(wordAt('ls ?.md', 1), ctx)).toEqual(['a.md', 'b.md'])
  })

  it('带目录前缀的 glob 保留前缀', () => {
    expect(expandWord(wordAt('ls projects/*.md', 1), ctx)).toEqual(['projects/p.md'])
  })

  it('* 不匹配隐藏文件', () => {
    expect(expandWord(wordAt('ls *', 1), ctx)).toEqual(['a.md', 'b.md', 'note.txt', 'projects'])
  })

  it('以 . 开头的模式可以匹配隐藏文件', () => {
    expect(expandWord(wordAt('ls .h*', 1), ctx)).toEqual(['.hidden'])
  })

  it('无匹配时保留模式原样', () => {
    expect(expandWord(wordAt('ls *.rs', 1), ctx)).toEqual(['*.rs'])
  })

  it('引号内的 * 不做 glob', () => {
    expect(expandWord(wordAt('ls "*.md"', 1), ctx)).toEqual(['*.md'])
  })
})

describe('边界', () => {
  it('空引号展开为一个空参数', () => {
    expect(expandWord(wordAt("echo ''", 1), ctx)).toEqual([''])
  })
})
