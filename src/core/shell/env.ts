import type { Env } from '../process'

export function createEnv(initial: Record<string, string> = {}): Env {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    get(name) { return map.get(name) },
    set(name, value) { map.set(name, value) },
    unset(name) { map.delete(name) },
    all() { return Object.fromEntries(map) },   // 副本，外部改动不影响内部状态
  }
}
