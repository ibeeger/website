import { describe, it, expect } from 'vitest'
import { createEnv } from './env'

describe('createEnv', () => {
  it('返回初始值', () => {
    expect(createEnv({ HOME: '/home/guest' }).get('HOME')).toBe('/home/guest')
  })

  it('未设置的变量返回 undefined', () => {
    expect(createEnv().get('NOPE')).toBeUndefined()
  })

  it('set 覆盖已有值', () => {
    const env = createEnv({ A: '1' })
    env.set('A', '2')
    expect(env.get('A')).toBe('2')
  })

  it('unset 移除变量', () => {
    const env = createEnv({ A: '1' })
    env.unset('A')
    expect(env.get('A')).toBeUndefined()
  })

  it('all 返回副本，改它不影响内部状态', () => {
    const env = createEnv({ A: '1' })
    const snapshot = env.all()
    snapshot.A = 'tampered'
    expect(env.get('A')).toBe('1')
  })
})
