import { describe, it, expect } from 'vitest'
import { createRegistry } from './registry'
import type { Process } from './process'

const stub = (name: string): Process => ({
  name,
  description: `stub ${name}`,
  async run() { return 0 },
})

describe('createRegistry', () => {
  it('注册后可按名取回', () => {
    const r = createRegistry()
    const p = stub('ls')
    r.register(p)
    expect(r.get('ls')).toBe(p)
  })

  it('未注册的名字返回 undefined', () => {
    expect(createRegistry().get('nope')).toBeUndefined()
  })

  it('list 按名称字典序排列', () => {
    const r = createRegistry()
    r.register(stub('whoami'))
    r.register(stub('cat'))
    r.register(stub('ls'))
    expect(r.list().map(p => p.name)).toEqual(['cat', 'ls', 'whoami'])
  })

  it('同名重复注册后者覆盖前者', () => {
    const r = createRegistry()
    r.register(stub('ls'))
    const second = stub('ls')
    r.register(second)
    expect(r.get('ls')).toBe(second)
    expect(r.list()).toHaveLength(1)
  })
})
