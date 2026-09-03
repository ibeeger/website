import { describe, it, expect } from 'vitest'
import { isAbsolute, normalize, join, dirname, basename } from './path'

describe('isAbsolute', () => {
  it('以斜杠开头即绝对路径', () => {
    expect(isAbsolute('/a')).toBe(true)
    expect(isAbsolute('a')).toBe(false)
  })
})

describe('normalize', () => {
  it('解析 ..', () => {
    expect(normalize('/a/b/../c')).toBe('/a/c')
  })

  it('.. 越过根时停在根', () => {
    expect(normalize('/../..')).toBe('/')
    expect(normalize('/a/../../..')).toBe('/')
  })

  it('丢弃 . 与空段', () => {
    expect(normalize('/a/./b')).toBe('/a/b')
    expect(normalize('/a//b')).toBe('/a/b')
  })

  it('去掉尾斜杠，但根保留', () => {
    expect(normalize('/a/b/')).toBe('/a/b')
    expect(normalize('/')).toBe('/')
  })

  it('相对路径保留前导 ..', () => {
    expect(normalize('../a')).toBe('../a')
    expect(normalize('a/../..')).toBe('..')
  })

  it('空串归一为当前目录', () => {
    expect(normalize('')).toBe('.')
  })
})

describe('join', () => {
  it('拼接 cwd 与相对路径', () => {
    expect(join('/home/guest', 'projects')).toBe('/home/guest/projects')
  })

  it('拼接后解析 ..', () => {
    expect(join('/home/guest', '../etc')).toBe('/home/etc')
  })

  it('忽略空段', () => {
    expect(join('/home', '', 'guest')).toBe('/home/guest')
  })
})

describe('dirname', () => {
  it('返回父目录', () => {
    expect(dirname('/a/b')).toBe('/a')
  })

  it('一级路径的父目录是根', () => {
    expect(dirname('/a')).toBe('/')
  })

  it('根的父目录是自己', () => {
    expect(dirname('/')).toBe('/')
  })
})

describe('basename', () => {
  it('返回最后一段', () => {
    expect(basename('/a/b')).toBe('b')
    expect(basename('/a/b/')).toBe('b')
  })

  it('根的 basename 是自己', () => {
    expect(basename('/')).toBe('/')
  })
})
