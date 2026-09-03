import { useCallback, useLayoutEffect, useState } from 'react'
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from './themes'

function readStored(): string {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return saved && saved in THEMES ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME        // 隐私模式下 localStorage 可能直接抛异常
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<string>(readStored)

  // useLayoutEffect 而不是 useEffect：后者在浏览器完成首次绘制之后才跑。
  // index.html 的内联调色板只覆盖默认主题，所以一个选过别的主题的用户刷新页面时，
  // 会先看到默认配色被画出来、再被换掉 —— 一次肉眼可见的闪烁。
  // useLayoutEffect 在绘制前同步执行，把这一帧消掉。
  useLayoutEffect(() => {
    const vars = THEMES[theme]
    if (!vars) return
    for (const [k, v] of Object.entries(vars)) {
      document.documentElement.style.setProperty(k, v)
    }
  }, [theme])

  const setTheme = useCallback((name: string) => {
    if (!(name in THEMES)) return
    setThemeState(name)
    try { localStorage.setItem(THEME_STORAGE_KEY, name) } catch { /* 忽略写入失败 */ }
  }, [])

  return { theme, setTheme, themes: Object.keys(THEMES) }
}
