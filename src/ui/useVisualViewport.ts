import { useEffect, useState } from 'react'

/**
 * 返回虚拟键盘占用的底部高度。
 * 移动端浏览器弹出键盘时不改变 window.innerHeight，只有 visualViewport 会变。
 */
export function useVisualViewport(): { bottomInset: number } {
  const [bottomInset, setBottomInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const inset = window.innerHeight - vv.height - vv.offsetTop
      setBottomInset(Math.max(0, Math.round(inset)))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return { bottomInset }
}
