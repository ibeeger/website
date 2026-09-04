import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback: (error: unknown) => ReactNode
}

type State = { error: unknown }

/**
 * 通用的 React 错误边界。
 *
 * node chunk 是在渲染阶段才求值的 React 元素，而 useTerminal 的惰性初始化
 * （buildInitialVfs(loadContent())）同样跑在渲染期——这两处的异常都发生在
 * proc.run 的 try/catch、内核执行器的兜底早已返回之后，谁都接不住。没有
 * 边界的话，任何一次这样的异常都会冒泡到 React 根、把整棵树卸载成白屏，
 * 除了刷新页面没有任何恢复手段（SkillBars 那次 RangeError 就是这一类问题
 * 在某一个具体组件上的一次发作，只在那一个点上打了补丁）。
 *
 * 这不是某个组件的 bug，是「渲染期求值」这整类设计天生带的风险面，所以在
 * 两个层次各封一道，而不是继续见一个补一个：单个 chunk 一道（挂在每个
 * OutputBlock 的每个 chunk 外，坏一个不连累其余输出与还活着的 input），
 * 应用根一道（兜住前者覆盖不到的一切，包括还没到 chunk 阶段的初始化异常）。
 */
/** 没捕获到异常时的哨兵值，用它而不是 null 整体作为 state，是为了让 State 类型保持 object 形状。 */
const NO_ERROR: unique symbol = Symbol('no-error')

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: NO_ERROR }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: unknown): void {
    console.error('ErrorBoundary 捕获到渲染异常：', error)
  }

  render(): ReactNode {
    if (this.state.error !== NO_ERROR) return this.props.fallback(this.state.error)
    return this.props.children
  }
}
