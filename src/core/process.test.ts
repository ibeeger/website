import { describe, it, expect } from 'vitest'
import { text, line, node, chunkToText } from './process'

describe('chunk 构造器', () => {
  it('text 产生不带换行的文本 chunk', () => {
    expect(text('hi')).toEqual({ type: 'text', text: 'hi' })
  })

  it('传入 style 时才带 style 字段', () => {
    expect(text('hi', { bold: true })).toEqual({
      type: 'text', text: 'hi', style: { bold: true },
    })
  })

  it('line 在末尾补一个换行', () => {
    expect(line('hi')).toEqual({ type: 'text', text: 'hi\n' })
  })

  it('node chunk 携带降级文本', () => {
    const c = node(null, () => 'fallback')
    expect(c.type).toBe('node')
    expect(chunkToText(c)).toBe('fallback')
  })

  it('chunkToText 对文本 chunk 原样返回', () => {
    expect(chunkToText(text('raw'))).toBe('raw')
  })
})
