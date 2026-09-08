import { describe, it, expect } from 'vitest'
import { decodeIdToken, usernameOf } from './identity'

/** 造一个形状真实、但签名是假的 JWT —— 被测函数本来就不验签。 */
function makeJwt(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `eyJhbGciOiJSUzI1NiJ9.${b64}.fake-signature`
}

const FULL = { sub: '1234567890', name: 'Xiaohan Cui', email: 'mr.web0310@gmail.com', picture: 'https://x/y.png' }

describe('decodeIdToken', () => {
  it('解出 sub / name / email / picture', () => {
    expect(decodeIdToken(makeJwt(FULL))).toEqual(FULL)
  })

  it('picture 缺失时不落一个 undefined 字段 —— 它会被 JSON.stringify 原样写进 localStorage', () => {
    const noPicture = { sub: FULL.sub, name: FULL.name, email: FULL.email }
    const got = decodeIdToken(makeJwt(noPicture))
    expect(got).toEqual(noPicture)
    expect(got !== null && 'picture' in got).toBe(false)
  })

  it('UTF-8 姓名不乱码 —— atob 出来的是字节不是字符', () => {
    expect(decodeIdToken(makeJwt({ ...FULL, name: '崔小涵' }))?.name).toBe('崔小涵')
  })

  // 下面每一条都对应一种线上真会遇到的坏输入。任何一条返回了对象而不是 null，
  // 都会让一个残缺身份被写进 localStorage 并长期驻留。
  it.each([
    ['空串', ''],
    ['不是 JWT', 'not-a-jwt'],
    ['只有 header', 'eyJhbGciOiJSUzI1NiJ9'],
    ['payload 不是合法 base64url', 'a.@@@@.c'],
    ['payload 不是 JSON', `a.${btoa('plain text').replace(/=+$/, '')}.c`],
  ])('%s → null', (_label, jwt) => {
    expect(decodeIdToken(jwt)).toBeNull()
  })

  it.each([
    ['缺 sub', { name: 'A', email: 'a@b.c' }],
    ['缺 name', { sub: '1', email: 'a@b.c' }],
    ['缺 email', { sub: '1', name: 'A' }],
    ['sub 是数字不是字符串', { sub: 1, name: 'A', email: 'a@b.c' }],
    ['name 是空串', { sub: '1', name: '', email: 'a@b.c' }],
  ])('%s → null', (_label, payload) => {
    expect(decodeIdToken(makeJwt(payload as Record<string, unknown>))).toBeNull()
  })

  // 单独一条而不是并进上面的 it.each：数组进不了那张表的元组类型，
  // 硬断言成 Record 会被 TS 判成可疑转换。
  it('payload 是数组 → null', () => {
    expect(decodeIdToken(`eyJhbGciOiJSUzI1NiJ9.${btoa('[]')}.fake-signature`)).toBeNull()
  })
})

describe('usernameOf', () => {
  it.each([
    ['Xiaohan Cui', 'xiaohan'],
    ['xiaohan', 'xiaohan'],
    ['Mary-Jane Watson', 'maryjane'],
    ['  Ada   Lovelace  ', 'ada'],
    ['R2D2 Unit', 'r2d2'],
  ])('%s → %s', (name, want) => {
    expect(usernameOf({ sub: '1', name, email: 'a@b.c' })).toBe(want)
  })

  // 提示符里出现非 ASCII 会破坏终端观感与对齐，落回一个稳妥的默认值。
  it.each(['崔小涵', '...', ''])('无 ASCII 可用时落回 user：%s', (name) => {
    expect(usernameOf({ sub: '1', name, email: 'a@b.c' })).toBe('user')
  })
})
