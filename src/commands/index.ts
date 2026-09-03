import { ls } from './fs/ls'
import { pwd } from './fs/pwd'
import { cd } from './fs/cd'
import { cat } from './fs/cat'
import { head } from './fs/head'
import { tail } from './fs/tail'
import { wc } from './fs/wc'
import { echo } from './text/echo'
import { grep } from './text/grep'
import { sort } from './text/sort'
import { uniq } from './text/uniq'
import type { Process } from '../core/process'

export const builtins: Process[] = [
  ls, pwd, cd, cat, head, tail, wc,
  echo, grep, sort, uniq,
]
