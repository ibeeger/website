import { node, type Process } from '../../core/process'
import { Markdown } from '../rich/Markdown'
import { parseProject, projectToText } from '../rich/ProjectCard'
import { skillsToText, type SkillGroup } from '../rich/SkillBars'
// 命令层暂不感知当前会话语言（那是 Task 3 的范围），先固定用 DEFAULT_LANG，
// 与 useTerminal.ts 里 loadContent(DEFAULT_LANG) 的默认语言保持一致。
import { enSkills as skillsData } from '../../content'
import { readOrFail } from './about'

/** 把 about / skills / projects 拼成一页可通读的简历。 */
export const resume: Process = {
  name: 'resume',
  description: '一页式简历',
  usage: 'resume',

  async run(io, ctx) {
    const home = ctx.env.get('HOME') ?? '/'
    const about = readOrFail(ctx, 'about.md') ?? ''
    const contact = readOrFail(ctx, 'contact.md') ?? ''

    const dir = ctx.vfs.resolve(home, 'projects')
    const projectTexts = ctx.vfs.isDir(dir)
      ? ctx.vfs.list(dir)
          .filter(e => e.kind === 'file' && e.name.endsWith('.md'))
          .map(e => projectToText(parseProject(
            ctx.vfs.readFile(`${dir}/${e.name}`), e.name.replace(/\.md$/, ''),
          )))
      : []

    const source = [
      about,
      '## 技能',
      skillsToText(skillsData.groups as SkillGroup[]),
      '## 项目',
      ...projectTexts,
      contact,
    ].join('\n')

    io.stdout.write(node(<Markdown source={source} />, () => source))
    return 0
  },
}
