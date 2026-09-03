export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}

export function normalize(p: string): string {
  const abs = isAbsolute(p)
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      const last = out[out.length - 1]
      if (out.length > 0 && last !== '..') out.pop()
      else if (!abs) out.push('..')       // 相对路径保留前导 ..，绝对路径在根处吞掉
      continue
    }
    out.push(seg)
  }
  if (abs) return '/' + out.join('/')
  return out.length > 0 ? out.join('/') : '.'
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(p => p !== '').join('/'))
}

export function dirname(p: string): string {
  const n = normalize(p)
  if (n === '/') return '/'
  const i = n.lastIndexOf('/')
  if (i < 0) return '.'
  return i === 0 ? '/' : n.slice(0, i)
}

export function basename(p: string): string {
  const n = normalize(p)
  if (n === '/') return '/'
  const i = n.lastIndexOf('/')
  return i < 0 ? n : n.slice(i + 1)
}
