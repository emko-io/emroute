# SPA mode configuration

## Summary

Add a `spa` option to control client-side rendering behaviour:
`"none" | "leaf" | "root" | "only"`.

## Modes

### `"none"` — SSR only, interactive widgets

No SPA router. All pages served via `/html/*` with full page loads.

A minimal script is injected instead of `main.js` that only registers widgets
via `ComponentElement.register()`. Widgets hydrate and remain interactive
(getData, event handlers, lifecycle). No client-side navigation.

Use case: content sites, documentation, blogs — no need for SPA but widgets
like search, nav highlights, or interactive code blocks still work.

### `"root"` — Full SPA (current default)

Current behaviour. `index.html` serves the SPA shell, client-side router
intercepts all navigation. Widgets hydrate. SSR available via `/html/*` and
`/md/*` prefixes.

### `"leaf"` — SSR-first, opt-in SPA

Full SPA router is loaded, but when `location.pathname === "/"` the router
redirects to `/html/`. This means:

- Landing on `/` always serves SSR HTML (no SPA shell at root).
- All generated links use `/html/*` by default, so navigation between pages
  is SSR with full page loads.
- Individual pages (e.g. `/about`) can use non-prefixed links internally for
  SPA-style sub-navigation (tabs, panels) without full reloads.
- Widgets hydrate everywhere.

Use case: apps that want SSR by default but need SPA behaviour within specific
pages (e.g. tabbed dashboards, multi-step forms).

### `"only"` — SPA only, no SSR

Full SPA router, no server-side rendering. The server serves static files and
the SPA shell only. `/html/*` and `/md/*` routes return 404.

Use case: apps deployed behind the emroute server that don't need SSR — the
server handles static assets and API proxying, the client handles all rendering.

| Mode     | SSR | SPA router                     | Widgets |
| -------- | --- | ------------------------------ | ------- |
| `"none"` | yes | no                             | hydrate |
| `"leaf"` | yes | yes (redirect `/` to `/html/`) | hydrate |
| `"root"` | yes | yes (current default)          | hydrate |
| `"only"` | no  | yes                            | hydrate |

## Implementation notes

### Config surface

```ts
await createDevServer({
  spa: 'root', // default, current behaviour
  // ...
}, denoServerRuntime);
```

### `"none"` mode

- Same `main.ts` bundle, but the router is conditionally created based on the
  `spa` config. Widgets register and hydrate regardless. When `spa` is `"none"`,
  the router is simply not instantiated — no second entry point or separate
  bundle needed.
- No `<router-slot>` activation, no History API interception.

### `"leaf"` mode

- SPA router receives the mode config.
- On init, if mode is `"leaf"` and `location.pathname === "/"`, redirect to
  `/html/`.
- All other SPA behaviour remains identical to `"root"`.
- Links in SSR output already use `/html/*` prefixes, so default navigation
  between pages is full SSR.

### `"only"` mode

- Dev server does not register `/html/*` or `/md/*` route handlers.
- All requests that don't match a static file serve `index.html` (SPA fallback).
- SSR renderers are not instantiated.

### Cache invalidation

Switching modes changes the injected script (`main.js` vs widget-only stub).
If the browser has cached the previous version, it may boot in the wrong mode.
The dev server should serve these scripts with `Cache-Control: no-cache` or
append a content hash query parameter (e.g. `main.js?v=abc123`) so that a mode
change takes effect immediately without requiring a hard refresh.

### No breaking changes

- Default is `"root"` — existing behaviour unchanged.
- The dev server already provides config to the SPA bundle; `spa` is a new
  field on `DevServerConfig`.
