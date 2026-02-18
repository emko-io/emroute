# Node/Bun-Compatible Server — Monorepo

## Goal

Make emroute runnable on Node.js and Bun via `npx emroute dev`. Zero config,
just works — a single `routes/index.page.md` in an empty folder is enough.

## Architecture: Monorepo

Turn emroute into a Deno workspace with two publishable packages:

```
emroute/
  packages/
    emroute/              ← @emkodev/emroute (JSR) — core library
    emroute-server/       ← emroute (npm) — Node runtime + CLI
  deno.json               ← workspace root
```

### `@emkodev/emroute` (JSR)

Everything that exists today. No changes to publishing target or consumer API.

### `emroute` (npm)

Thin package containing:

- `server.node.ts` — Node `ServerRuntime` implementation (`node:http`,
  `node:fs/promises`, `node:child_process`, `node:fs` watch)
- `cli.node.ts` — CLI entry point (same subcommands as Deno CLI: `dev`,
  `build`, `generate`)
- `bin/emroute` — npm bin entry for `npx emroute dev`

Imports `@emkodev/emroute` via workspace reference at dev time. Ships a bundled
build (esbuild bundles emroute core into it at publish time) so consumers get
zero runtime dependencies — `npx emroute dev` just works.

### Why monorepo

- One repo, one test suite, one CI
- Workspace reference — no cross-registry dependency at dev time
- Version bumps in lockstep
- No vendoring step, no stale copies
- Deno workspaces are minimal (`"workspace"` array in root `deno.json`)

## Prerequisites (on main)

1. **Remove TS parameter properties** — Node type stripping doesn't support
   `public readonly x` in constructor params. Already removed on spike branch,
   should be ported to main regardless.
2. **Remove `accessor` keyword** — same Node type stripping limitation. Already
   removed on spike branch.

These are non-breaking refactors that benefit the codebase independently.

## Spike Results (feat/node-server-runtime)

The spike branch proved the concept works:

- **ServerRuntime abstraction works.** Adding `spawn()` and making the bundler
  configurable was enough to decouple `dev.server.ts` from Deno.
- **Node runtime runs.** All three rendering modes (SPA, SSR HTML, SSR Markdown)
  serve correctly on Node 24.
- **esbuild as bundler.** Works via npx. Needs `--watch=forever` (not `--watch`)
  when stdin is closed.
- **URLPattern** — available in Node 24+ (shipped). No longer a blocker.

### Spike files to port

| Spike file | Destination |
|---|---|
| `server/server.type.ts` | `packages/emroute/` — add `spawn()` to `ServerRuntime` |
| `server/server.node.ts` | `packages/emroute-server/` |
| `server/cli.node.ts` | `packages/emroute-server/` |

## Implementation Steps

1. Restructure repo into Deno workspace (`packages/emroute/`, `packages/emroute-server/`)
2. Port TS compatibility fixes from spike (parameter properties, accessor)
3. Add `spawn()` to `ServerRuntime` interface, implement in `server.deno.ts`
4. Port `server.node.ts` from spike branch
5. Create npm CLI entry (`bin/emroute`)
6. Build script: esbuild bundles core + Node runtime into self-contained package
7. Publish `emroute` to npm (name already reserved)

## Distribution

| Registry | Package | Invocation |
|---|---|---|
| JSR | `@emkodev/emroute` | `deno run -A jsr:@emkodev/emroute/server/cli dev` |
| npm | `emroute` | `npx emroute dev` |

Both CLIs share the same subcommands and convention detection. The only
difference is the runtime adapter and default bundler (deno bundle vs esbuild).

## Non-Goals

- Production HTTP server — emroute provides the rendering engine, not the
  server. Consumers bring their own (`Deno.serve`, Express, Hono, etc.) via
  `createEmrouteServer`.
- Bun-specific runtime — Bun is Node-compatible enough that `server.node.ts`
  should work as-is. No separate `server.bun.ts` unless compatibility issues
  surface.
