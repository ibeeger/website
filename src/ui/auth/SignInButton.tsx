import { useEffect, useRef } from 'react'
import type { Gis } from './gis'

/**
 * 挂载即请求 GIS 把官方按钮画进这个容器。按钮活在 Google 的 iframe 里，
 * 只能选主题与尺寸，没法完全终端化 —— 这是换取「点击必定弹窗」这个确定性
 * 付出的代价，见设计文档「为什么不用 One Tap」。
 */
export function SignInButton(props: {
  gis: Gis
  onCredential(jwt: string): void
  onError(): void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    let alive = true
    props.gis
      .renderButton(el, { onCredential: jwt => { if (alive) props.onCredential(jwt) } })
      .catch(() => { if (alive) props.onError() })
    // 卸载后不再回调：命令可能已经被 Ctrl+C 中断，那时 resolve 一个
    // 早已 settle 的 promise 虽然无害，但让「谁还活着」保持显式更好推理。
    return () => { alive = false }
    // 只在挂载时渲染一次。props 每次渲染都是新函数引用，进依赖数组会导致
    // 按钮被反复重画。仓库既有同类抑制见 src/ui/BootSequence.tsx。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="signin-button" ref={ref} />
}
