# SPA: rapid navigation race condition

**Status**: Fixed.

## Problem

`handleNavigation` had no cancellation mechanism. If the user clicked rapidly
between routes, multiple renders ran concurrently. The last one to _complete_
(not the last one _initiated_) won the DOM, so a slow earlier navigation could
overwrite a fast later one.

`SpaHtmlRouter` created one `AbortController` at `initialize()` for the
lifetime of the router, but individual navigations didn't get their own signals.
`getData()` received `context.signal` from `buildComponentContext`, but this was
`undefined` in SPA mode.

## What was done

### `src/renderer/spa/html.renderer.ts`

- Per-navigation `AbortController` (`navigationController`) — aborts the
  previous navigation before starting a new one.
- `signal.aborted` checked after every async boundary in `handleNavigation`,
  `renderPage`, and `renderRouteContent`.
- Signal passed through to `renderPage()` and `renderRouteContent()`.
- Aborted navigations silently discarded in catch block.

### `src/route/route.core.ts`

- `buildComponentContext()` accepts optional `signal: AbortSignal`, forwards it
  to fetch calls for companion files, and includes it in the returned
  `ComponentContext` so `getData()` can observe cancellation.

### Browser test

- `test/browser/spa.test.ts` — "rapid sequential navigations render only the
  final destination": fires 3 navigations without awaiting, asserts only the
  last route renders.

**Source:** `1.0.0-beta.6.issues.md` #1, #15
