import { useCallback, useEffect, useState } from 'react'
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

  useEffect(() => {
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
