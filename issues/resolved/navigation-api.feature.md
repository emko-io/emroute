# Replace History API with Navigation API — DONE

## Status

Implemented in 1.5.2. The SPA router now uses the Navigation API exclusively.

## What Was Done

### `src/renderer/spa/html.renderer.ts`

- Removed `popstate` listener, `click` listener with `composedPath()` traversal,
  `navigationController` field, `scrollToAnchor()` method, and all
  `history.pushState`/`replaceState` calls
- Added single `navigation.addEventListener('navigate', ...)` handler with
  `event.intercept({ scroll: 'manual', handler })` and `event.scroll()`
- SSR adoption uses `navigation.updateCurrentEntry()` instead of
  `history.replaceState()`
- Public `navigate()` method calls `navigation.navigate()` with `{ committed,
  finished }` promise handling (AbortError catch for redirects)
- `handleNavigation()` is now a pure render function — no history manipulation,
  no scroll handling, no abort controller management
- Graceful degradation: `'navigation' in globalThis` check — browsers without the
  API get SSR full-page navigation

### `src/type/navigation-api.d.ts`

- Added Navigation API type declarations (Navigation, NavigateEvent,
  NavigationHistoryEntry, etc.) since TypeScript's lib.dom.d.ts does not yet
  include them
- Published as `@emkodev/emroute/types/navigation-api` export
- Will be removed once TypeScript ships native Navigation API types

### `doc/architecture/ADR-0014-navigation-api.md`

- Decision record for the migration (Option C: migrate, no fallback)

## What Was NOT Changed

- `src/type/route.type.ts` — `RouterState` and `NavigateOptions` kept as-is for
  API compatibility. `scrollY` field is unused but not removed.
- Browser tests — need full rework grouped by SpaMode (separate task)

## References

- ADR-0014: Navigation API (decision record)
- ADR-0006: Native APIs, Zero Dependencies
- [Navigation API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)

## Resolution

**Resolved in 1.5.0.** Navigation API fully implemented — `SpaHtmlRouter` uses
`navigation.addEventListener('navigate')` exclusively. ADR-0014 documents the
decision. Type declarations published as `@emkodev/emroute/types/navigation-api`.
