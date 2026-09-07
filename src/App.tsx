import { Terminal } from './ui/Terminal'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { readStoredLang } from './ui/useLang'
import { UI_TEXT } from './i18n/uiText'

export default function App() {
  return (
    <ErrorBoundary
      // 这段 fallback 在 useLang 之上，拿不到语言状态，只能自己读一次存档。
      // readStoredLang 内部把 localStorage 访问包了 try/catch 并回落 DEFAULT_LANG：
      // 崩溃页里再抛一次异常就没有第二道边界接得住了，只剩白屏。
      fallback={() => (
        <div className="terminal" role="alert">
          <p className="t-red">{UI_TEXT[readStoredLang()].crash}</p>
        </div>
      )}
    >
      <Terminal />
    </ErrorBoundary>
  )
}
