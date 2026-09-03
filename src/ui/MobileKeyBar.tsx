export type MobileKey = 'tab' | 'ctrl-c' | 'up' | 'down' | '|' | '~' | '/' | '-'

const KEYS: { key: MobileKey; label: string }[] = [
  { key: 'tab', label: 'Tab' },
  { key: 'ctrl-c', label: '^C' },
  { key: 'up', label: '↑' },
  { key: 'down', label: '↓' },
  { key: '|', label: '|' },
  { key: '~', label: '~' },
  { key: '/', label: '/' },
  { key: '-', label: '-' },
]

export function MobileKeyBar({ onKey }: { onKey(k: MobileKey): void }) {
  return (
    <div className="mobile-keybar">
      {KEYS.map(k => (
        <button
          key={k.key}
          type="button"
          aria-label={k.label}
          // 必须在 mousedown 阶段阻止默认行为，否则输入框失焦、虚拟键盘收起
          onMouseDown={e => e.preventDefault()}
          onTouchStart={e => e.preventDefault()}
          onClick={() => onKey(k.key)}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}
