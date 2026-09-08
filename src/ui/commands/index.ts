import { about } from './about'
import { projects } from './projects'
import { skills } from './skills'
import { contact } from './contact'
import { resume } from './resume'
import { open } from './open'
import { matrix } from './matrix'
import { createLogin } from '../../commands/sys/login'
import { buttonCredential } from '../auth/buttonCredential'
import type { Process } from '../../core/process'

/** 需要构造 React 元素的命令。与 builtins 分开，是为了守住 src/commands 的纯 TS 边界。 */
// login 本身是纯 TS（住在 src/commands/sys/login.ts），但它需要一个会渲染
// React 的 credential source，所以接线发生在这里而不是 builtins。
export const uiCommands: Process[] = [about, projects, skills, contact, resume, open, matrix, createLogin(buttonCredential)]
