import { node, type Process } from '../../core/process'
import { SkillBars, skillsToText, type SkillGroup } from '../rich/SkillBars'
// 命令层暂不感知当前会话语言（那是 Task 3 的范围），先固定用 DEFAULT_LANG，
// 与 useTerminal.ts 里 loadContent(DEFAULT_LANG) 的默认语言保持一致。
import { enSkills as skillsData } from '../../content'

export const skills: Process = {
  name: 'skills',
  description: '技术栈',
  usage: 'skills',

  async run(io) {
    const groups = skillsData.groups as SkillGroup[]
    io.stdout.write(node(<SkillBars groups={groups} />, () => skillsToText(groups)))
    return 0
  },
}
