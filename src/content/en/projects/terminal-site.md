# terminal-site

The site you're looking at. A static terminal emulator with no off-the-shelf
terminal library — the whole command path is hand-written.

- **Shell front end**: lexer → parser → expansion → glob → executor.
  Pipes `|`, redirection `>` `>>`, environment variables `$VAR`, exit codes `$?`,
  tab completion, history.
- **Virtual filesystem**: an in-memory tree with path resolution, directory
  traversal, and the same error codes a real system returns
  (ENOENT / EISDIR / EPERM).
- **Process contract**: every command implements one `Process` interface and
  talks through a streaming `IO`. Any command composes into a pipeline for free —
  including ones added later.
- **Zero-framework kernel**: React imports are banned under `src/core/`, enforced
  by ESLint. The kernel unit-tests under Node, and the same boundary leaves room
  to mount WASM command modules later.

One thing worth calling out on the SEO side: crawlers don't run JavaScript, so a
build-time Vite plugin renders the Markdown content into semantic HTML and injects
it into `index.html` — clipped from sighted users, fully visible to crawlers and
screen readers, and restored to normal layout when JavaScript is off.

- Stack: TypeScript, React, Vite, Vitest
- Size: ~3,500 lines of implementation, 45 test files / 524 cases
- Status: actively maintained
