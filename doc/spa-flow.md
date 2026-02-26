# SPA → PWA Architecture

## Concept

The server is always there — the question is where it runs.

| Mode | Server location | JS on client | Base path |
|---|---|---|---|
| `none` | remote | none | `/html/`, `/md/` |
| `leaf` | remote | widgets/hydration, no router | `/html/`, `/md/` |
| `root` | remote | `createEmrouteApp` + FetchRuntime | `/app/` |
| `only` | local (SW optional) | `createEmrouteApp` + UniversalBrowserRuntime | `/app/` |

Three base paths, three audiences:
- `/html/` — SSR HTML for browsers without JS, progressive enhancement
- `/md/` — markdown for machines (curl, LLMs)
- `/app/` — PWA/SPA for browsers with JS (`root`/`only` modes)

`createEmrouteApp` = `createEmrouteServer` running in browser + Navigation
API glue (~20 lines). Same server, same trie, same SSR renderers. The
Navigation API intercepts `/app/` link clicks, strips prefix, calls
`htmlRouter.render()`, injects content into `<router-slot>`.

## Merged Modules

Runtime only stores `.js`. No `.ts` at runtime.

Each page/widget is a single merged `.js` file: compiled component code
with companion file contents (.html, .md, .css) inlined:

```js
// compiled component...
export default page;

export const __files = {
  html: `<h1>About</h1>`,
  css: `.about { color: red }`
};
```

`loadModule()` returns `{ default: component, __files }` — no separate
file reads needed. `buildComponentContext` reads from `__files`.

### Content scenarios

- **Developer**: writes `.ts` + companions → build step → merged `.js`
- **End-user** (browser IDE, CMS): writes `.js` + companions → merge → `.js`
- **Third-party widgets**: distributed as merged `.js` modules
- **Deploy/migration**: source runtime reads raw, target receives merged `.js`

### Spike result

Proven in `spike/merge-module.spike.ts`:
- Transpile `.ts` → `.js` via `Bun.Transpiler`
- Append `export const __files = { key: \`escaped content\` }`
- Backticks, `${}`, newlines all survive template literal round-trip
- Blob URL import works, `__files` accessible

## Build vs Runtime Separation

`bundle()` and `transpile()` move OUT of Runtime.

**Runtime** = pure storage + serving:
- `handle()` — raw passthrough
- `query()` — read (Response or text)
- `command()` — write
- `loadModule()` — import `.js` from storage

**Build tool** (upstream, not runtime's concern):
- Scan source `.ts` + companions → merge → write `.js` into runtime
- CLI: `emroute build`
- Dev server: watch + re-merge on change
- Browser IDE: user writes `.js`, merge companions, `command()` into runtime

## Breaking changes

- `SpaHtmlRouter` removed. Replaced by `createEmrouteApp`.
- `HashRouter` removed. Can be recovered from git.
- `base.renderer.ts` removed. DOM-based rendering pipeline gone.
- `root` mode: client runs `createEmrouteServer` + `FetchRuntime` locally.
- `only` mode: client runs `createEmrouteServer` + `UniversalBrowserRuntime`.
- `none` and `leaf` modes: unaffected.
- Bare path redirects: `/about` → `/app/about` (was `/html/about`) in root/only.

## Implementation phases

### Phase 1: Merged module build step

Extract `bundle()` and `transpile()` from Runtime. Create a build tool that:
1. Scans routes + widgets directories
2. For each page/widget: compile `.ts` + inline companions → merged `.js`
3. Write merged `.js` into runtime via `command()`
4. Build SPA entry bundle (emroute.js, app.js)

Runtime interface simplifies: remove `bundle()`, `transpile()`.

### Phase 2: FetchRuntime + createEmrouteApp (root mode)

Already spiked on `experimental/pwa-thin-client`:
- `runtime/fetch.runtime.ts` — fetches from remote server
- `src/renderer/spa/thin-client.ts` — `EmrouteApp` + `createEmrouteApp`
- Server serves shell at `/app/*`, redirects bare paths to `/app/`

Remaining: wire `loadModule()` to load merged `.js` (no `.ts`), adapt
`buildComponentContext` to read `__files` from loaded module.

### Phase 3: UniversalBrowserRuntime (only mode)

Composes online (FetchRuntime) + offline (IDB/Cache) runtimes:
- `query()` → offline returns fast, online fires HEAD for freshness
- `command()` → offline stores immediately, online syncs in background
- `loadModule()` → import `.js` from IDB/Cache
- `onStale(callback)` → user-approved re-render on stale content

### Phase 4: Service Worker shell (only mode, optional)

`sw.ts` — runs `createEmrouteServer` + `UniversalBrowserRuntime`:
- `install`: populate offline storage from manifests
- `fetch`: `handleRequest()` for navigation, offline storage for static
- Same server code, same rendering, same widget resolution

### Phase 5: Update strategy

- Background freshness checks via online runtime
- `onStale` callback → user notification → approved re-render
- SW lifecycle for `sw.js` updates
- Cache eviction for storage-constrained devices
