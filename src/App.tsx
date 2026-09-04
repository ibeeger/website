import { Terminal } from './ui/Terminal'
import { ErrorBoundary } from './ui/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary
      fallback={() => (
        <div className="terminal" role="alert">
          <p className="t-red">出错了，请刷新页面重试。</p>
        </div>
      )}
    >
      <Terminal />
    </ErrorBoundary>
  )
}
