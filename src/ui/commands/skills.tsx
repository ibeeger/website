import { node, type Ctx, type Process } from '../../core/process'
import { SkillBars, skillsToText, type SkillGroup } from '../rich/SkillBars'
import { readOrFail } from './about'

type Item = SkillGroup['items'][number]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isItem(v: unknown): v is Item {
  return isRecord(v) && typeof v.name === 'string' && typeof v.level === 'number'
}

function isGroup(v: unknown): v is SkillGroup {
  return isRecord(v) && typeof v.name === 'string' && Array.isArray(v.items) && v.items.every(isItem)
}

/**
 * 技能表走 VFS 而不是直接 import JSON：文件树是按当前语言构建的，绕过它的
 * 读取路径切了语言也不会变，且内容层就有了两条不同步的来源。
 *
 * 校验到每一项、在命令层就把坏数据拦下：node chunk 在 React 渲染阶段才求值，
 * 那时 proc.run 的 try/catch 早已返回，坏数据只会被 OutputBlock 的 ErrorBoundary
 * 兜成一行标红的降级文本 —— 没有退出码、没有 stderr、grep 不到，用户也不知道
 * 是文件坏了。前置校验换来的是 stderr + 非零退出码这种能被看见、被管道处理的失败。
 * 读不出或形状不对时返回 null，由调用方决定是报错还是留空。
 */
export function readSkillGroups(ctx: Ctx): SkillGroup[] | null {
  const raw = readOrFail(ctx, 'skills.json')
  if (raw === null) return null

  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!isRecord(parsed)) return null

  const groups = parsed.groups
  return Array.isArray(groups) && groups.every(isGroup) ? groups : null
}

export const skills: Process = {
  name: 'skills',
  description: '技术栈',
  usage: 'skills',

  async run(io, ctx) {
    const groups = readSkillGroups(ctx)
    if (groups === null) { io.stderr.writeLine('skills: skills.json 不存在或格式不正确'); return 1 }
    io.stdout.write(node(<SkillBars groups={groups} />, () => skillsToText(groups)))
    return 0
  },
}
