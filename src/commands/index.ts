import { ls } from './fs/ls'
import { pwd } from './fs/pwd'
import { cd } from './fs/cd'
import { cat } from './fs/cat'
import { head } from './fs/head'
import { tail } from './fs/tail'
import { wc } from './fs/wc'
import { tree } from './fs/tree'
import { find } from './fs/find'
import { touch } from './fs/touch'
import { mkdir } from './fs/mkdir'
import { rm } from './fs/rm'
import { echo } from './text/echo'
import { grep } from './text/grep'
import { sort } from './text/sort'
import { uniq } from './text/uniq'
import { help } from './sys/help'
import { man } from './sys/man'
import { whoami } from './sys/whoami'
import { uname } from './sys/uname'
import { date } from './sys/date'
import { env } from './sys/env'
import { exportCmd } from './sys/export'
import { which } from './sys/which'
import { history } from './sys/history'
import { clear } from './sys/clear'
import type { Process } from '../core/process'

export const builtins: Process[] = [
  ls, pwd, cd, cat, head, tail, wc,
  tree, find, touch, mkdir, rm,
  echo, grep, sort, uniq,
  help, man, whoami, uname, date, env, exportCmd, which, history, clear,
]
