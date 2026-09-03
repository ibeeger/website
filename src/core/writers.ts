import { text, type Chunk, type Style, type Writer } from './process'
import type { VFS } from './vfs/vfs'

/** 富节点降级为文本。管道与文件的下游只认文本。 */
export function textOnly(base: Writer): Writer {
  const w: Writer = {
    write(c) { base.write(c.type === 'text' ? c : text(c.toText())) },
    writeText(s, style) { w.write(text(s, style)) },
    writeLine(s, style) { w.write(text(s + '\n', style)) },
    close() { base.close() },
  }
  return w
}

/**
 * 给尚无样式的文本 chunk 补上默认样式（stderr 标红）。
 * close() 刻意留空：stderr 绝不能关闭它借用的终端 writer。
 */
export function styled(base: Writer, style: Style): Writer {
  const apply = (c: Chunk): Chunk => (c.type === 'text' && !c.style ? { ...c, style } : c)
  const w: Writer = {
    write(c) { base.write(apply(c)) },
    writeText(s, st) { base.write(apply(text(s, st))) },
    writeLine(s, st) { base.write(apply(text(s + '\n', st))) },
    close() { /* 空操作 —— 见上 */ },
  }
  return w
}

/** 累积全部写入，在 close() 时一次性落盘。 */
export function fileWriter(vfs: VFS, abs: string, append: boolean): Writer {
  let buf = ''
  let closed = false
  const w: Writer = {
    write(c) {
      if (closed) throw new Error('write after close')
      buf += c.type === 'text' ? c.text : c.toText()
    },
    writeText(s) { w.write(text(s)) },
    writeLine(s) { w.write(text(s + '\n')) },
    close() {
      if (closed) return
      closed = true
      if (append) vfs.appendFile(abs, buf)
      else vfs.writeFile(abs, buf)
    },
  }
  return w
}
