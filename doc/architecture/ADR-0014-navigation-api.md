# ADR-0014: Navigation API to Replace History API

**Status**: Implemented (Option C — migrate, no fallback) — v1.5.2
**Date**: 2026-02-17
**Decision Makers**: Development Team

## Context

The SPA router in emroute (`SpaHtmlRouter`) currently uses the History API
(`pushState`, `replaceState`, `popstate`) for client-side navigation. All History
API usage is concentrated in `src/renderer/spa/html.renderer.ts`:

1. **`history.pushState`** — normal SPA navigation (line ~280)
2. **`history.replaceState`** — SSR adoption on first load (line ~155) and
   replace-mode navigation (line ~278)
3. **`popstate` listener** — back/forward button handling (lines ~87-97)
4. **Manual link interception** — `click` listener on `document` using
   `composedPath()` to find `<a>` elements across Shadow DOM boundaries
   (lines ~99-140)

Supporting types: `RouterState` (pathname, params, scrollY) and
`NavigateOptions` (replace, state) in `src/type/route.type.ts`.

The **Navigation API** (`window.navigation`) is a modern replacement designed
specifically for SPAs. It provides a single `navigate` event that fires for ALL
navigation types (link clicks, back/forward, `navigate()` calls, form
submissions), with `intercept()` for handling and promise-based completion
tracking. Browser support as of Feb 2026: Chrome 102+, Edge 102+, Firefox 147+,
Safari 26.2+ (~84% global coverage).

## Current Architecture

```
Link click → composedPath() finds <a> → preventDefault() → handleNavigation()
Back/Forward → popstate event → handleNavigation()
handleNavigation() → normalize URL → match route → render → pushState/replaceState
```

Two separate entry points (click listener + popstate) funnel into one handler.
The click listener must manually:

- Traverse `composedPath()` for Shadow DOM
- Check for external links, modified clicks, target attributes, downloads
- Extract href and determine push vs replace

## What Navigation API Changes

```
Any navigation → navigate event → event.intercept({ handler }) → render
```

One entry point. The browser handles link clicks, back/forward, form
submissions, and `navigation.navigate()` calls — all fire the same event.

## Analysis

### Arguments FOR Migrating

1. **Single navigation handler** — replaces both the `click` listener and
   `popstate` listener with one `navigate` event. The current code has ~50 lines
   of link interception logic (composedPath traversal, external link detection,
   modifier key checks, download detection). The Navigation API handles all of
   this natively — `event.canIntercept` is `false` for cross-origin,
   `event.hashChange` for fragments, `event.downloadRequest` for downloads.

2. **Shadow DOM link interception is free** — the current router uses
   `composedPath()` to find `<a>` elements inside Shadow DOM (ADR-0011). The
   Navigation API fires `navigate` for ALL link clicks regardless of Shadow DOM
   boundaries. This eliminates a fragile piece of custom code.

3. **Form submission interception** — `navigate` fires for `<form>` GET
   submissions. This is currently unhandled — form submissions in `spa: 'root'`
   mode cause full page loads. The Navigation API would make form-based
   navigation work as SPA transitions for free.

4. **Structured state management** — `navigation.currentEntry.getState()`
   returns a structured clone (not the shared mutable reference that
   `history.state` returns). `navigation.updateCurrentEntry({ state })` replaces
   the error-prone `replaceState` for state-only updates.

5. **History entry access** — `navigation.entries()` provides the full same-
   origin history list. `traverseTo(key)` enables direct navigation to any
   entry. This could enable features like "navigate to entry where user was on
   page X" without sequential back() calls.

6. **Promise-based completion** — `navigation.navigate()` returns `{ committed,
   finished }` promises. Currently `handleNavigation()` returns `void` and
   completion is fire-and-forget. Promises would enable the router to surface
   navigation success/failure to widgets (e.g., loading states, error handling).

7. **Built-in scroll restoration** — `intercept({ scroll: 'manual' })` with
   `event.scroll()` provides explicit control over when scroll restoration
   happens. Currently we store `scrollY` in `RouterState` and manage it
   manually.

8. **Aligns with ADR-0006 (native APIs, zero dependencies)** — the Navigation
   API is a platform primitive purpose-built for the exact problem we're solving.
   Adopting it reduces custom code in favor of browser-native behavior.

9. **`navigationType` property** — `event.navigationType` distinguishes
   `'push'`, `'replace'`, `'reload'`, and `'traverse'` natively. Currently we
   infer this from `options.replace` and the popstate origin, which is less
   reliable.

### Arguments AGAINST Migrating

1. **Browser support gap is overstated** — Can I Use reports ~84% "support" but
   the ~16% gap consists of IE (0.2%), UC Browser (1.7%), Opera Mini (1.9%),
   and KaiOS (0.14%) — browsers where SPA navigation was never expected to
   work. All major browsers (Chrome, Edge, Firefox, Safari, Samsung Internet,
   Opera) support the Navigation API. The actual user impact is ~4%, and those
   users are better served by SSR and `/md/` than a JS-heavy SPA router.

2. **Graceful degradation is built-in** — emroute serves full SSR HTML and
   Markdown without JS. Browsers without the Navigation API get full-page
   loads, not broken pages. This is not a regression — it's the same experience
   as `spa: 'none'` mode, which is a first-class supported mode.

3. **Current code works and is minimal** — the entire History API integration is
   ~60 lines of well-tested code in one file. The "complexity" being replaced is
   not actually complex. The Shadow DOM `composedPath()` handling is 5 lines.

4. **No `navigate` event on initial page load** — the API doesn't fire for the
   first page load. SSR adoption logic (`data-ssr-route` detection,
   `replaceState` for initial state) must remain as a separate code path
   regardless.

5. **Testing complexity** — Playwright doesn't expose `window.navigation`
   directly. Tests would need to verify behavior through side effects rather
   than direct API assertions. The `popstate`-based approach is well-understood
   by the testing ecosystem.

6. **Dual-code-path maintenance** — if we need a History API fallback for
   unsupported browsers, we maintain two implementations instead of one. This
   doubles the surface area for bugs.

7. **Experimental API stability** — while browsers are shipping it, the spec
   could still change in edge cases. `precommitHandler` and
   `NavigationActivation` are still marked experimental within the experimental
   API.

## Options

### Option A: Stay on History API

Keep the current implementation. It works, it's tested, it's universal.

- Zero migration effort or risk
- No browser support concerns
- Miss out on form interception, promise-based navigation, and simplified
  Shadow DOM handling
- Link interception code stays as manual `click` listener

### Option B: Migrate with History API Fallback

Use Navigation API when available, fall back to current History API code when
not. Feature-detect with `'navigation' in globalThis`.

- Best user coverage — SPA works everywhere
- Two code paths to maintain and test
- Fallback path gradually becomes dead code as browser support grows
- Contradicts simplicity principle — more code to solve the same problem

### Option C: Migrate, No Fallback

Use Navigation API exclusively. Browsers without it get full-page navigation
(SSR still works — emroute's progressive enhancement guarantees this).

- Simplest code — one implementation
- Aligns with progressive enhancement philosophy (SSR is the baseline, SPA is
  the enhancement)
- ~4% of users (IE, UC Browser, Opera Mini, KaiOS) lose SPA navigation but
  retain full SSR and Markdown functionality
- Clean break — no legacy code accumulation
- Acceptable if emroute targets modern browsers and values code simplicity over
  universal SPA support

### Option D: Wait and Revisit

Monitor browser support. Revisit when Navigation API reaches ~95%+ coverage
(likely late 2026 / early 2027 based on browser update cycles).

- No effort now
- No risk now
- Benefit deferred
- Form submission interception remains unhandled in the interim

## Decision

**Option C: Migrate, no fallback.** Use the Navigation API exclusively. Browsers
without it get full-page navigation via SSR.

emroute's identity is built on using browser-native capabilities instead of
JavaScript abstractions — no JSX, native custom elements, Shadow DOM, SSR-first.
Reimplementing the Navigation API's functionality in JavaScript contradicts this
philosophy. The History API code works, but it is custom code solving a problem
the platform now solves natively.

SSR guarantees that every page works without JS. The SPA router is a progressive
enhancement. The browsers without Navigation API support (IE, UC Browser, Opera
Mini, KaiOS — ~4% of users combined) are better served by SSR and `/md/` anyway.
Every major browser already supports the API.

## Consequences

### Positive

- Single `navigate` event replaces click listener + popstate listener
- ~50 lines of link interception logic (composedPath, modifier keys, external
  link checks) replaced by `event.canIntercept`
- Form GET submissions become SPA transitions for free
- Shadow DOM link interception works without custom code
- Promise-based navigation enables future loading states and error handling
- Aligns with ADR-0006 (native APIs, zero dependencies)

### Negative

- ~4% of users (IE, UC Browser, Opera Mini, KaiOS) lose SPA navigation — SSR
  and Markdown still work
- SSR adoption logic remains a separate code path (no navigate event on first
  load)
- Tests may need adjustment for Navigation API assertions

### Neutral

- Route matching, rendering, and widget hydration are unchanged
- `NavigateOptions` type maps cleanly to Navigation API concepts

## References

- Code: `src/renderer/spa/html.renderer.ts` (Navigation API usage)
- Code: `src/type/navigation-api.d.ts` (type declarations)
- Code: `src/type/route.type.ts:113-131` (RouterState, NavigateOptions)
- Related: ADR-0006 (Native APIs, Zero Dependencies)
- Related: ADR-0011 (Light DOM Server-Side Widget Rendering — Shadow DOM context)
- External: [Navigation API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)
- External: [Can I Use — Navigation API](https://caniuse.com/mdn-api_navigation)
- External: [Navigation API Explainer (WICG)](https://github.com/WICG/navigation-api/blob/main/README.md)

## Notes

The ~84% figure from Can I Use is misleading. The unsupported ~16% of browser
_versions_ account for only ~4% of actual users (IE 0.2%, UC Browser 1.7%,
Opera Mini 1.9%, KaiOS 0.14%). Every major browser — Chrome, Edge, Firefox,
Safari, Samsung Internet, Opera — already ships the Navigation API. The users
on unsupported browsers are in bandwidth-constrained environments where SSR
full-page loads and `/md/` are the better experience regardless.

Form submission interception (Argument FOR #3) is particularly relevant. Form
GET submissions in `spa: 'root'` currently cause full page loads. The Navigation
API makes these seamless SPA transitions for free.
