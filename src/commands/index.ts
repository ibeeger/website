import { ls } from './fs/ls'
import { pwd } from './fs/pwd'
import { cd } from './fs/cd'
import type { Process } from '../core/process'

/** 全部内置命令。后续任务往这里追加。 */
export const builtins: Process[] = [ls, pwd, cd]
