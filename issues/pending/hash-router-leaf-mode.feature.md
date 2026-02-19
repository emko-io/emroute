# Hash-based mini-app routing in leaf mode

## Status: Implemented (experimental, on `feature/hash-routing` branch)

## Context

`leaf` mode bundles JS (core + widgets) but creates no emroute router. The
build pipeline already produces an import map resolving `@emkodev/emroute/spa`
to the minified core bundle, which includes `RouteCore`.

emroute's SPA router already skips `hashChange` events
(`if (event.hashChange) return;`), leaving them free for consumer use.

## Implementation

A lightweight `HashRouter` wraps `RouteCore` with `hashchange` event handling.
Routes are defined inline by the consumer via module loaders — they are NOT
part of the main routes manifest.

### Consumer API

```ts
import { createHashRouter } from '@emkodev/emroute/spa';

await createHashRouter({
  routes: [
    { pattern: '/settings', loader: () => import('./settings.page.ts') },
    { pattern: '/users/:id', loader: () => import('./user.page.ts') },
  ],
  slot: 'hash-slot', // CSS selector, defaults to 'hash-slot'
});
```

Each loader returns a module with a `default` export that is a `PageComponent`.
The full `getData` → `renderHTML` → `getTitle` lifecycle is reused.

### Architecture

- `BaseRenderer` — shared rendering pipeline extracted from `SpaHtmlRouter`
  (route hierarchy traversal, component loading, markdown wait, title updates)
- `SpaHtmlRouter extends BaseRenderer` — Navigation API, SSR adoption, view
  transitions, error boundaries, status pages
- `HashRouter extends BaseRenderer` — `hashchange` listener, inline route
  definitions, no basePath, no error boundaries

The `HashRouter` internally builds a mini `RoutesManifest` from inline routes
so `RouteCore` matching and module loading work unchanged.

### How it works

1. Server SSR-renders `/html/some/leaf` as a normal `leaf` page
2. Page hydrates, widgets initialize
3. Consumer entry imports `createHashRouter` from the bundled SPA module
4. `HashRouter` listens to `hashchange` events
5. Parses `location.hash` (e.g. `#/settings` → `/settings`)
6. Matches against inline patterns via `RouteCore`
7. Loads component via loader, runs `getData` → `renderHTML` pipeline
8. Renders into `<hash-slot>` element on the page
9. Back/forward works via browser hash history

### Files

| File | Description |
|------|-------------|
| `src/renderer/spa/base.renderer.ts` | Shared rendering pipeline |
| `src/renderer/spa/html.renderer.ts` | SPA router (extends BaseRenderer) |
| `src/renderer/spa/hash.renderer.ts` | Hash router (extends BaseRenderer) |
| `src/renderer/spa/mod.ts` | Exports `createHashRouter`, `HashRouter` |
| `test/unit/hash.renderer.test.ts` | 20 unit tests |
| `test/browser/leaf/hash.test.ts` | 8 browser integration tests |

## Open questions (resolved)

- **Expose HashRouter or leave to consumers?** → Exposed as `createHashRouter`
- **PageComponent or plain render functions?** → PageComponent with module
  loaders. Full `getData`/`renderHTML` lifecycle.
- **Route definitions?** → Inline array with `{ pattern, loader }` objects.
  NOT in the main manifest.

## Still uncertain

- Is this feature needed at all? Consumers can wire their own hash handling
  with `RouteCore` directly. The `HashRouter` saves ~30 lines of boilerplate
  but adds API surface to maintain.
- Should hash routes support nested layouts? Currently they do (via
  `buildRouteHierarchy`), but mini-apps are usually flat.
