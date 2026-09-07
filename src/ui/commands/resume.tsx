import { node, type Process } from '../../core/process'
import { RESUME_TEXT } from '../../i18n/ui'
import { Markdown } from '../rich/Markdown'
import { parseProject, projectToText } from '../rich/ProjectCard'
import { skillsToText } from '../rich/SkillBars'
import { readOrFail } from './about'
import { readSkillGroups } from './skills'

/** 把 about / skills / projects 拼成一页可通读的简历。 */
export const resume: Process = {
  name: 'resume',
  description: '一页式简历',
  usage: 'resume',

  async run(io, ctx) {
    // 这两个小标题是命令自己拼的，不来自任何内容文件 —— 硬编码就会在英文
    // 简历中间插两行中文。
    const t = RESUME_TEXT[ctx.host.currentLang()]
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
      `## ${t.skills}`,
      // 读不出技能表不该让整页简历消失 —— about / contact 缺失时也是这么处理的。
      skillsToText(readSkillGroups(ctx) ?? []),
      `## ${t.projects}`,
      ...projectTexts,
      contact,
    ].join('\n')

    io.stdout.write(node(<Markdown source={source} />, () => source))
    return 0
  },
}
