import { node, type Process } from '../../core/process'
import { SkillBars, skillsToText, type SkillGroup } from '../rich/SkillBars'
import { skills as skillsData } from '../../content'

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
