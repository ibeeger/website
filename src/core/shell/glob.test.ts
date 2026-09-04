import { describe, it, expect } from 'vitest'
import { patternToRegex } from './glob'

describe('patternToRegex', () => {
  it('* 匹配任意除 / 外的字符序列', () => {
    const re = patternToRegex('*.md')
    expect(re.test('about.md')).toBe(true)
    expect(re.test('a/b.md')).toBe(false)
  })

  it('? 匹配单个除 / 外的字符', () => {
    const re = patternToRegex('a?c')
    expect(re.test('abc')).toBe(true)
    expect(re.test('ac')).toBe(false)
  })

  it('转义正则元字符，不把它们当通配符', () => {
    const re = patternToRegex('a.b')
    expect(re.test('axb')).toBe(false)
    expect(re.test('a.b')).toBe(true)
  })

  it('整串匹配，不是子串匹配', () => {
    const re = patternToRegex('foo')
    expect(re.test('xfooy')).toBe(false)
    expect(re.test('foo')).toBe(true)
  })
})
