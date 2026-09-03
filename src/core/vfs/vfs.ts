import { basename, dirname, isAbsolute, join, normalize } from './path'

export type FileInode = { kind: 'file'; name: string; content: string; mtime: number }
export type DirInode = { kind: 'dir'; name: string; children: Map<string, Inode>; mtime: number }
export type Inode = FileInode | DirInode

export type VfsErrorCode =
  | 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'ENOTEMPTY' | 'EEXIST' | 'EPERM'

export class VfsError extends Error {
  constructor(readonly code: VfsErrorCode, readonly path: string) {
    super(`${code}: ${path}`)
    this.name = 'VfsError'
  }
}

export interface VFS {
  resolve(cwd: string, p: string): string
  stat(abs: string): Inode | null
  isDir(abs: string): boolean
  readFile(abs: string): string
  writeFile(abs: string, content: string): void
  appendFile(abs: string, content: string): void
  list(abs: string): Inode[]
  mkdir(abs: string, recursive: boolean): void
  remove(abs: string, recursive: boolean): void
  touch(abs: string): void
}

export function emptyDir(name: string, mtime = 0): DirInode {
  return { kind: 'dir', name, children: new Map(), mtime }
}

export function createVfs(root: DirInode, now: () => number = Date.now): VFS {
  /** 沿路径下行；任何中间段不是目录即 ENOTDIR，缺失即返回 null。 */
  function lookup(abs: string): Inode | null {
    const n = normalize(abs)
    if (n === '/') return root
    let cur: Inode = root
    for (const seg of n.split('/').filter(Boolean)) {
      if (cur.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
      const next = cur.children.get(seg)
      if (!next) return null
      cur = next
    }
    return cur
  }

  function mustDir(abs: string): DirInode {
    const it = lookup(abs)
    if (!it) throw new VfsError('ENOENT', abs)
    if (it.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
    return it
  }

  function writeFileImpl(abs: string, content: string): void {
    const n = normalize(abs)
    const existing = lookup(n)
    if (existing?.kind === 'dir') throw new VfsError('EISDIR', abs)
    const parent = mustDir(dirname(n))
    const name = basename(n)
    parent.children.set(name, { kind: 'file', name, content, mtime: now() })
    parent.mtime = now()
  }

  return {
    resolve(cwd, p) {
      return isAbsolute(p) ? normalize(p) : join(cwd, p)
    },

    stat(abs) {
      try {
        return lookup(abs)
      } catch {
        return null            // 中间段不是目录，视作不存在
      }
    },

    isDir(abs) {
      return lookup(abs)?.kind === 'dir'
    },

    readFile(abs) {
      const it = lookup(abs)
      if (!it) throw new VfsError('ENOENT', abs)
      if (it.kind === 'dir') throw new VfsError('EISDIR', abs)
      return it.content
    },

    writeFile(abs, content) {
      writeFileImpl(abs, content)
    },

    appendFile(abs, content) {
      const existing = lookup(normalize(abs))
      if (existing?.kind === 'dir') throw new VfsError('EISDIR', abs)
      const prev = existing?.kind === 'file' ? existing.content : ''
      writeFileImpl(abs, prev + content)
    },

    list(abs) {
      const it = lookup(abs)
      if (!it) throw new VfsError('ENOENT', abs)
      if (it.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
      return [...it.children.values()].sort((a, b) => a.name.localeCompare(b.name))
    },

    mkdir(abs, recursive) {
      const n = normalize(abs)
      if (n === '/') {
        if (recursive) return
        throw new VfsError('EEXIST', abs)
      }
      const existing = lookup(n)
      if (existing) {
        if (recursive && existing.kind === 'dir') return
        throw new VfsError('EEXIST', abs)
      }
      const segs = n.split('/').filter(Boolean)
      let cur: DirInode = root
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]!
        const next = cur.children.get(seg)
        if (!next) {
          const isLast = i === segs.length - 1
          if (!isLast && !recursive) throw new VfsError('ENOENT', abs)
          const made = emptyDir(seg, now())
          cur.children.set(seg, made)
          cur.mtime = now()
          cur = made
          continue
        }
        if (next.kind !== 'dir') throw new VfsError('ENOTDIR', abs)
        cur = next
      }
    },

    remove(abs, recursive) {
      const n = normalize(abs)
      if (n === '/') throw new VfsError('EPERM', abs)
      const it = lookup(n)
      if (!it) throw new VfsError('ENOENT', abs)
      if (it.kind === 'dir' && it.children.size > 0 && !recursive) {
        throw new VfsError('ENOTEMPTY', abs)
      }
      const parent = mustDir(dirname(n))
      parent.children.delete(basename(n))
      parent.mtime = now()
    },

    touch(abs) {
      const it = lookup(normalize(abs))
      if (it?.kind === 'file') {
        it.mtime = now()
        return
      }
      if (it?.kind === 'dir') {
        it.mtime = now()
        return
      }
      writeFileImpl(abs, '')
    },
  }
}
