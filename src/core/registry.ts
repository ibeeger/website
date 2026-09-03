import type { Process, Registry } from './process'

export function createRegistry(): Registry {
  const map = new Map<string, Process>()
  return {
    register(p: Process) {
      map.set(p.name, p)
    },
    get(name: string) {
      return map.get(name)
    },
    list() {
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
    },
  }
}
