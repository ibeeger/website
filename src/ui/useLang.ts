import { useCallback, useLayoutEffect, useState } from 'react'
import { DEFAULT_LANG, LANGS, LANG_STORAGE_KEY, type Lang } from '../i18n/lang'

/** BCP 47 标签，给 <html lang> 用。读屏软件据此选发音。 */
const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-CN' }

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v)
}

function readStored(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    return isLang(saved) ? saved : DEFAULT_LANG
  } catch {
    return DEFAULT_LANG        // 隐私模式下 localStorage 可能直接抛异常
  }
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(readStored)

  // 与 useTheme 同理用 useLayoutEffect：<html lang> 影响读屏发音，
  // 让它在首次绘制前就位，而不是绘制后再改。
  useLayoutEffect(() => {
    document.documentElement.lang = HTML_LANG[lang]
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    if (!isLang(next)) return
    setLangState(next)
    try { localStorage.setItem(LANG_STORAGE_KEY, next) } catch { /* 忽略写入失败 */ }
  }, [])

  return { lang, setLang, langs: LANGS }
}
