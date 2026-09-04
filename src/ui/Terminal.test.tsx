// @vitest-environment jsdom
import './test-setup' // 注册 afterEach(cleanup)，见 test-setup.ts 顶部注释
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Terminal } from './Terminal'
import { BOOT_STORAGE_KEY } from './BootSequence'

// jsdom 没实现 scrollIntoView；Terminal 的自动滚底效果会调用它，不垫一个空实现
// 每个渲染了 <Terminal /> 的测试都会因为不相关的 TypeError 而炸掉。
Element.prototype.scrollIntoView ??= () => {}

// Task 21 加入了开机动画，未播放过时会先逐行打字再挂载 PromptLine。这里的测试
// 关心的是命令运行期间的焦点/disabled 行为，不是开机动画本身（那部分由
// BootSequence.test.tsx 单独覆盖），所以标记为「已播放过」以跳过动画、
// 让 PromptLine 与其 input 立即挂载。
beforeEach(() => { sessionStorage.setItem(BOOT_STORAGE_KEY, '1') })

describe('Terminal', () => {
  it('命令运行期间与结束后，input 都不会被 disabled，焦点也不会丢（回归：曾经因 disabled={running} 被浏览器踢到 body）', async () => {
    render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'echo hi' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // 命令还没跑完的这一刻：submit() 已经同步把 running 置真了。
    // 这是能真正区分「有没有 disabled={term.running}」的时机——
    // 等命令跑完再查，两种写法看到的 disabled 都已经是 false，测不出区别。
    expect(input.disabled).toBe(false)

    // 等命令真正跑完：输出出现在屏幕上
    await waitFor(() => expect(screen.getByText('hi')).toBeTruthy())

    expect(input.disabled).toBe(false)
    expect(document.activeElement).toBe(input)

    // 焦点没丢，才谈得上「打字有反应」：确认这个 input 仍然在正常接收输入
    fireEvent.change(input, { target: { value: 'x' } })
    expect(input.value).toBe('x')
  })

  it('移动端按键条在光标当前位置插入字符，而不是无条件拼到行尾', () => {
    render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'cd projects' } })
    // 把光标移到 "cd pro|jects" 中间
    input.setSelectionRange(6, 6)
    fireEvent.select(input)

    fireEvent.click(screen.getByRole('button', { name: '/' }))

    expect(input.value).toBe('cd pro/jects')
  })

  it('反向搜索开启时，点按键条的 ^C 会关闭搜索框（跟物理键盘 Ctrl+C 一样）', () => {
    render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    // 进入反向搜索
    fireEvent.keyDown(input, { key: 'r', ctrlKey: true })
    expect(screen.queryByText(/reverse-i-search/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '^C' }))

    expect(screen.queryByText(/reverse-i-search/)).toBeNull()
  })

  it('反向搜索开启时，点按键条的 Tab 不会修改（背后隐藏的）input 草稿', () => {
    render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    // 先在正常态打出草稿，再进入反向搜索——草稿此时藏在 search.query 后面
    fireEvent.change(input, { target: { value: 'ec' } })
    fireEvent.keyDown(input, { key: 'r', ctrlKey: true })
    expect(screen.queryByText(/reverse-i-search/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tab' }))

    // 用物理键盘的 Escape 退出搜索（onInterrupt 本来就正确处理了 search.active，
    // 不掺和被测的 Tab 分支），让隐藏的 input 草稿重新显形
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText(/reverse-i-search/)).toBeNull()
    expect(input.value).toBe('ec')
  })

  it('反向搜索开启时，点按键条的符号键追加进查询串（命中项跟着更新），不碰隐藏的 input 草稿', () => {
    const { container } = render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    // 造一条含 '/' 的历史，等下要靠它验证命中项确实跟着查询串更新
    fireEvent.change(input, { target: { value: 'echo test/path' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // 正常态打出草稿；草稿在整个搜索过程中应该保持不动
    fireEvent.change(input, { target: { value: 'zz' } })

    fireEvent.keyDown(input, { key: 'r', ctrlKey: true })
    expect(screen.queryByText(/reverse-i-search/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '/' }))

    // 符号进了查询串（真实 DOM input 的 value 就是 search.query）
    expect(input.value).toBe('/')
    // 命中项跟着查询串更新：自绘文字区域此刻应该正好显示匹配到的历史整行
    expect(container.querySelector('.promptline-text')?.textContent).toBe('echo test/path')

    // 退出搜索后草稿原封不动——符号进了查询串，没有污染 input
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText(/reverse-i-search/)).toBeNull()
    expect(input.value).toBe('zz')
  })

  it('点击容器时，若有非折叠的文字选区，不抢焦点（否则拖拽选中的输出文字会被清掉，页面上任何文字都复制不出来）', async () => {
    // 断言方式：spy 住 input.focus，而不是「点击后检查选区是否还在」——
    // jsdom 里 focus() 本身会把无关的 selection 折叠掉（这跟真实浏览器一致，
    // 也正是这条 finding 描述的机制），所以「点击后选区是否还在」测的其实是
    // 「focus 有没有被调用」的间接效果。既然事件处理器的分支就是
    // 「选区非折叠 -> 不调用 focus()」，直接 spy focus 更准确，也不需要
    // 先把 input blur 掉——jsdom 的 blur() 会无条件折叠全局 selection
    // （跟真实浏览器里「blur 一个 <input> 不影响页面上不相关的文字选区」
    // 不一致，是 jsdom 未忠实实现的一角），依赖它会测出假象。
    const { container } = render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'echo hi' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('hi')).toBeTruthy())

    // 模拟「用户刚拖拽选中了一段输出文字」：在真实输出节点上建一个非折叠的
    // document selection——click 事件的公共祖先是整个 .terminal 容器，
    // 选区可以落在输出区的任何文本节点上。
    const output = screen.getByText('hi')
    const range = document.createRange()
    range.selectNodeContents(output)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    expect(sel.isCollapsed).toBe(false)

    const focusSpy = vi.spyOn(input, 'focus')
    fireEvent.click(container.querySelector('.terminal')!)

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('点击容器时，没有选区（折叠态）就正常聚焦输入框', () => {
    const { container } = render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    window.getSelection()?.removeAllRanges()
    expect(window.getSelection()?.isCollapsed).toBe(true)

    const focusSpy = vi.spyOn(input, 'focus')
    fireEvent.click(container.querySelector('.terminal')!)

    expect(focusSpy).toHaveBeenCalled()
  })

  it('反向搜索开启时按 ↑ 会退出搜索并照常导航历史（跟 bash 一致），而不是原地悄悄改写隐藏的草稿', async () => {
    render(<Terminal />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'echo one' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('one')).toBeTruthy())

    fireEvent.keyDown(input, { key: 'r', ctrlKey: true })
    expect(screen.queryByText(/reverse-i-search/)).toBeTruthy()

    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(screen.queryByText(/reverse-i-search/)).toBeNull()
    expect(input.value).toBe('echo one')
  })
})
