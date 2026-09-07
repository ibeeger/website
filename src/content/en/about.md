# About

Full-stack engineer focused on front-end architecture and developer tools.

I care less about shipping features than about why a thing has the shape it does.
The terminal you're using is an example: no terminal emulator library, no shell
library. Lexing, parsing, expansion, globbing, pipes, and the virtual filesystem
are all hand-written TypeScript. React only paints characters on screen — a
boundary ESLint enforces, so a React import under `src/core/` fails the build.

How I work:

- **Tests first.** Roughly 3,500 lines of implementation against 45 test files
  and 524 cases. The kernel runs under Node with no browser involved.
- **Comments explain why, not what.** The code already says what it does.
  Why it's written this way, and why not the other way, only a comment can carry.
- **Accessibility isn't a patch.** With JavaScript disabled this terminal falls
  back to a semantic résumé a screen reader can read end to end. Hiding uses clip,
  not `display: none` — the latter gets skipped by screen readers entirely.

- Focus: TypeScript / React / Rust / WebAssembly
- Based in: China
- Status: open to opportunities

Type `projects` to see what I've built, `skills` for what I know,
`contact` to reach me.

If you're on Chrome with the built-in model enabled, type `ask` to talk to me —
that model runs entirely on your own machine and nothing leaves it.
