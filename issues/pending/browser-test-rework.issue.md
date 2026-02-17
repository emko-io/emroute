# Rework Browser Tests by SpaMode

## Problem

The current `test/browser/spa.test.ts` is a single flat file that runs all tests
against one server mode. This has several issues:

1. **Stale selectors** — tests assert `mark-down h1` but SSR now pre-renders
   markdown as flat HTML (no `<mark-down>` wrapper in the DOM).
2. **Single mode** — tests run against `spa: 'root'` only. The four modes
   (`none`, `leaf`, `root`, `only`) have fundamentally different rendering
   pipelines and the test server setup differs per mode.
3. **No mode-specific coverage** — `spa: 'none'` (zero JS, form-based nav),
   `spa: 'leaf'` (widgets hydrate, no router), and `spa: 'only'` (no SSR
   content) are untested in the browser test suite.

## Goal

Rewrite the browser test suite grouped by SpaMode. Each mode gets its own test
file with a mode-appropriate server setup.

## Structure

```
test/browser/
  spa-none.test.ts     — SSR-only, no JS, form navigation, redirects
  spa-leaf.test.ts     — SSR + widget hydration, no router
  spa-root.test.ts     — SSR + SPA router (Navigation API), hydration
  spa-only.test.ts     — SPA-only, no SSR content, shell + client render
  setup.ts             — shared server/browser lifecycle
```

## Per-Mode Test Focus

### `none` — Zero JS

- SSR HTML renders correctly
- Links are full page loads (no SPA interception)
- Form GET navigates via server
- Trailing slash redirects
- No `<script>` tags in output

### `leaf` — Widget Hydration Only

- SSR HTML renders correctly
- Widget custom elements hydrate (getData, renderHTML, hydrate lifecycle)
- No SPA router — all navigation is full page load
- `data-ssr` adoption works for widgets

### `root` — Full SPA + SSR

- SSR adoption (`data-ssr-route`)
- Navigation API interception (link clicks, back/forward, programmatic)
- View transitions
- Route params, nested routes, redirects
- Widget hydration after SPA navigation
- Error boundaries, 404 pages

### `only` — SPA Shell Only

- Shell loads, router initializes
- Client-side rendering without SSR content
- All navigation is SPA (no SSR fallback to test)

## Notes

- Each test file starts its own server with the correct `spa` mode
- Server setup per mode may differ (entry point, bundle config)
- `TEST_PORT` should be unique per mode to allow parallel execution
- Selectors must match current SSR output (no `mark-down` wrappers for
  pre-rendered markdown)
