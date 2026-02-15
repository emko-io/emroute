Decision Made: Keep It Simple — Modes Are Not a Router Concern

What we're keeping:

- Islands/widgets approach (SSR + interactive components)
- Existing SPA router (optional, ~30-40KB overhead)
- Clean mental model: make pages, add widgets
- `isLeaf` on ComponentContext for layout vs leaf detection

What we're dropping:

- `SpaMode` enum on the router (none/leaf/root/only)
- /spa/* prefix intent system
- Mode-aware link interception logic

Why modes collapsed:

The four modes conflate two independent concerns — server behavior and
client bundling — into a single router enum. Analysis showed:

- `none` vs `only` are server/bundling decisions, not router behavior.
  `none` = don't bundle the router. `only` = don't serve SSR.
- `leaf` vs `root` differ only in which `<a>` clicks get intercepted.
  The router loads the full manifest either way, so `leaf` is just
  `root` with a self-imposed handicap. Real scoping (partial manifest,
  smaller bundle) was never implemented.

The real axes are orthogonal:

1. Server: does /html/* serve SSR content? (config)
2. Bundle: is the SPA router included? (code-gen)
3. Scope: full routes or a subset? (future, if needed)

These map to application archetypes, not router options:

- SSG-ish: zero JS, pure SSR HTML/MD, no widgets
- Islands: SSR + selective widget hydration, no router
- SPA: index.html shell, client router, full navigation
- PWA: SPA + manifest + service worker + offline

Each archetype implies different bundling, server config, element
registration strategy, and file generation — far beyond what a router
click handler should decide.

Experimental work preserved:

- Branch: experimental/spa-prefix-intent
- Includes: /spa/* normalization, mode-aware routing, debug logger
- Debug logger (localStorage-based) is useful standalone — extract if needed
- Available if scoped routing (real `leaf` mode) is ever revisited

Implications — emroute becomes a framework, not just a library:

`main.ts` becomes an implementation detail. Users should not write it.
The framework generates it based on what exists — has routes? Include
router. Has widgets? Register them. Has neither? Pure SSR, zero JS.
The current routes.manifest.ts / widgets.manifest.ts are already
generated; main.ts should join them.

Convention-based detection replaces configuration. The file system
already IS the router — extend that principle to the entire stack:

- `routes/` exists → routing
- `widgets/` exists → widget registration + hydration JS
- `index.html` exists → custom shell (otherwise default)
- `manifest.json` exists → PWA mode
- `sw.ts` exists → service worker bundling
- No .ts files at all → pure SSG, zero client JS

The archetype emerges from the files, not from config. No config file
with `mode: 'spa'`. Instead, the user escalates capability by adding
files, not flipping flags. Only .md/.html pages and no widgets = zero
JS output. Add a widget = islands bundle. Add index.html + route .ts
files = SPA shell + router bundle.

A CLI, not just a library:

- `emroute dev` — what the dev server does now
- `emroute build` — static export (SSG) or production bundle
- `emroute init` — scaffold with archetype selection
- `npx emroute` / `deno run emroute` for zero-install

Production server. The current dev server is explicitly not for
production. Two paths:

- Build step outputs static files (SSG — nginx/CDN serves them)
- Production server for dynamic routes (SSR with Deno.serve)
- Or both: static export for what can be static, server for dynamic

What this does NOT need (yet):

- A plugin system (premature)
- Middleware abstractions (Deno.serve is enough)
- A config file (conventions first, escape hatches later)

The path forward:

- Modes belong at the server/codegen layer, not in the router
- Focus on making islands/widgets excellent
- SPA router stays available for apps that need it
- No mode configuration on the router itself
- Minimal next step: make main.ts generation aware of what's present,
  so zero-JS vs islands vs SPA falls out naturally from the file
  system scan rather than a mode flag
