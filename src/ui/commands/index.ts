import { about } from './about'
import { projects } from './projects'
import { skills } from './skills'
import { contact } from './contact'
import { resume } from './resume'
import { open } from './open'
import { matrix } from './matrix'
import type { Process } from '../../core/process'

/** 需要构造 React 元素的命令。与 builtins 分开，是为了守住 src/commands 的纯 TS 边界。 */
export const uiCommands: Process[] = [about, projects, skills, contact, resume, open, matrix]
