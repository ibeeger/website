// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ProjectCard, parseProject, projectToText } from './ProjectCard'

// 项目 Markdown 是作者手写的内容文件。一行裸 URL（没有「标签：」前缀）是完全
// 合理、甚至是被 isUrl 这个设计鼓励的写法。body.search(/[:：]/) 找的是第一个
// 冒号——裸 URL 场景下那正是 `https:` 里的那个，会把 { label: 'https',
// value: '//mysite.com' } 切出来，既不再匹配 isUrl（渲染成死文本），
// projectToText 也吐出被切坏的串，projects | grep 那个 URL 也会失手。
const SOURCE_WITH_BARE_URL = [
  '# bare-url-project',
  '',
  '一个只写裸链接、不带标签前缀的项目。',
  '',
  '- https://mysite.com',
].join('\n')

describe('parseProject 对裸 URL meta 行的处理', () => {
  it('裸 URL 行不按冒号切，label 为空、value 是完整 URL', () => {
    const project = parseProject(SOURCE_WITH_BARE_URL, 'fallback')
    expect(project.meta).toContainEqual({ label: '', value: 'https://mysite.com' })
  })

  it('带标签前缀的正常场景不受影响', () => {
    const source = '# p\n\n概要。\n\n- 源码：https://example.com\n'
    const project = parseProject(source, 'fallback')
    expect(project.meta).toContainEqual({ label: '源码', value: 'https://example.com' })
  })
})

describe('ProjectCard 对裸 URL meta 行的处理', () => {
  it('渲染成可点击的链接，而不是 "https:" 加死文本', () => {
    const project = parseProject(SOURCE_WITH_BARE_URL, 'fallback')
    const { container } = render(<ProjectCard project={project} />)
    const link = container.querySelector('a[href="https://mysite.com"]')
    expect(link).toBeTruthy()
  })
})

describe('projectToText 对裸 URL meta 行的处理', () => {
  it('降级文本里 URL 完整、未被切断，能被 grep 命中', () => {
    const project = parseProject(SOURCE_WITH_BARE_URL, 'fallback')
    const text = projectToText(project)
    expect(text).toContain('https://mysite.com')
  })
})
