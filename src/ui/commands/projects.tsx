import { node, type Process } from '../../core/process'
import { ProjectCard, parseProject, projectToText } from '../rich/ProjectCard'

export const projects: Process = {
  name: 'projects',
  description: '我做过的项目',
  usage: 'projects',

  async run(io, ctx) {
    const home = ctx.env.get('HOME') ?? '/'
    const dir = ctx.vfs.resolve(home, 'projects')

    if (!ctx.vfs.isDir(dir)) {
      io.stdout.writeLine('暂无项目。')
      return 0
    }

    const entries = ctx.vfs.list(dir).filter(e => e.kind === 'file' && e.name.endsWith('.md'))
    if (entries.length === 0) {
      io.stdout.writeLine('暂无项目。')
      return 0
    }

    for (const entry of entries) {
      const source = ctx.vfs.readFile(`${dir}/${entry.name}`)
      const project = parseProject(source, entry.name.replace(/\.md$/, ''))
      io.stdout.write(node(
        <ProjectCard key={entry.name} project={project} />,
        () => projectToText(project),
      ))
    }
    return 0
  },
}
