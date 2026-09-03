import { createRegistry } from './registry'
import { createEnv } from './shell/env'
import { lex, ShellSyntaxError } from './shell/lexer'
import { parse } from './shell/parser'
import { execute } from './shell/executor'
import { completePath } from './complete'
import type { Ctx, Host, Process, Writer } from './process'
import type { VFS } from './vfs/vfs'

const DEFAULT_ENV: Record<string, string> = {
  HOME: '/home/guest',
  USER: 'guest',
  HOSTNAME: 'terminal',
  SHELL: '/bin/bash',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  TERM: 'xterm-256color',
  LANG: 'zh_CN.UTF-8',
  PWD: '/home/guest',
}

export interface Kernel {
  readonly ctx: Ctx
  run(line: string, out: Writer, signal: AbortSignal): Promise<number>
  complete(line: string): { candidates: string[]; replaceFrom: number }
  prompt(): string
}

export function createKernel(opts: {
  vfs: VFS
  host: Host
  commands?: Process[]
  env?: Record<string, string>
}): Kernel {
  const env = createEnv({ ...DEFAULT_ENV, ...opts.env })
  const registry = createRegistry()
  for (const c of opts.commands ?? []) registry.register(c)

  // 会话状态：跨命令存活，由 getter/setter 暴露给每次 run 新建的 Ctx
  const session = {
    cwd: env.get('HOME') ?? '/',
    lastExitCode: 0,
    history: [] as string[],
  }

  function makeCtx(signal: AbortSignal): Ctx {
    return {
      get cwd() { return session.cwd },
      set cwd(v: string) { session.cwd = v; env.set('PWD', v) },
      get lastExitCode() { return session.lastExitCode },
      set lastExitCode(v: number) { session.lastExitCode = v },
      history: session.history,
      env, vfs: opts.vfs, registry, host: opts.host, signal,
    }
  }

  const idleCtx = makeCtx(new AbortController().signal)

  function shortCwd(): string {
    const home = env.get('HOME') ?? '/'
    if (session.cwd === home) return '~'
    if (session.cwd.startsWith(home + '/')) return '~' + session.cwd.slice(home.length)
    return session.cwd
  }

  return {
    get ctx() { return idleCtx },

    async run(line, out, signal) {
      if (line.trim() !== '') session.history.push(line)

      const ctx = makeCtx(signal)
      try {
        const code = await execute(parse(lex(line)), ctx, out)
        session.lastExitCode = code
        return code
      } catch (e) {
        // 只有词法/语法错误会走到这里；命令异常已在 executor 内部兜底
        const msg = e instanceof ShellSyntaxError ? e.message : String(e)
        out.writeLine(`bash: ${msg}`, { color: 'red' })
        session.lastExitCode = 2
        return 2
      }
    },

    complete(line) {
      const m = /(\S*)$/.exec(line)
      const frag = m?.[1] ?? ''
      const replaceFrom = line.length - frag.length
      const before = line.slice(0, replaceFrom).trim()

      if (before === '') {
        return {
          candidates: registry.list().map(p => p.name).filter(n => n.startsWith(frag)),
          replaceFrom,
        }
      }

      const argv = before.split(/\s+/)
      const proc = registry.get(argv[0]!)
      if (proc?.complete) {
        return { candidates: proc.complete([...argv, frag], idleCtx), replaceFrom }
      }
      return { candidates: completePath(frag, idleCtx), replaceFrom }
    },

    prompt() {
      return `${env.get('USER')}@${env.get('HOSTNAME')}:${shortCwd()}$ `
    },
  }
}
