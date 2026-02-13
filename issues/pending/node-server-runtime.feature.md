# Node/Bun-Compatible Dev Server

## Goal

Make the emroute dev server runnable on Node.js and Bun, not just Deno. Ideally
as a standalone tool users can invoke with `npx emroute-server` or `dx` in any
folder containing a `/routes` directory — zero config, just works.

## Spike Results (feat/node-server-runtime)

The branch has a working proof-of-concept:

- **ServerRuntime abstraction works.** `server.type.ts` already had the right
  interface; adding `spawn()` and making the bundler configurable was enough to
  decouple `dev.server.ts` from Deno entirely.
- **Node runtime runs.** `server.node.ts` implements ServerRuntime with
  `node:http`, `node:fs/promises`, `node:child_process`, `node:fs` (watch).
  All three rendering modes (SPA, SSR HTML, SSR Markdown) serve correctly on
  Node 24.
- **esbuild as bundler.** Works out of the box via npx. Needs `--watch=forever`
  (not `--watch`) when stdin is closed.

### Compatibility issues discovered

- **Node type stripping** does not support TS parameter properties
  (`public readonly x` in constructor) or the `accessor` keyword. Both were
  removed in the spike. These changes should be ported to main regardless.
- **URLPattern** is not available in Node 23 (lands in Node 24). This is a
  framework-level dependency, not a server issue.
- **Import maps / package self-references** (`@emkodev/emroute`) are resolved by
  Deno via `deno.json` exports but esbuild doesn't know about them. A real app
  would install emroute as a package, so this is only a dev/test problem.

## Distribution Decision

The server should **not** live inside the emroute package. Options:

1. **Separate package** (`emroute-server` or `@emkodev/emroute-server`) —
   published to npm/jsr, runnable via `npx emroute-server` / `deno run`.
2. **Not distributed** — users write their own thin server using emroute's SSR
   renderers directly (already supported).

If distributed separately:

- Use **node: built-in modules only** — works on Deno, Node, and Bun.
- Ship as a CLI bin with sensible defaults: scan `./routes`, bundle entry point,
  serve on 1420. A single `index.page.md` in an empty folder should be enough.
- Bundler should be pluggable (esbuild default, deno bundle, custom).

## Files on the spike branch

- `server/server.type.ts` — SpawnHandle + spawn() added to ServerRuntime
- `server/dev.server.ts` — bundler config, fallback HTML shell with script tag
- `server/server.deno.ts` — spawn() via Deno.Command
- `server/server.node.ts` — full Node.js ServerRuntime implementation
- `server/cli.node.ts` — Node/Bun CLI entry point
- `server/cli.deno.ts` — updated to pass bundler config
- `src/route/route.core.ts` — removed `accessor` keyword
- `tool/fs.type.ts` — removed TS parameter property
