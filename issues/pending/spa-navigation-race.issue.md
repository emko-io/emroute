# SPA: rapid navigation race condition

`src/renderer/spa/html.renderer.ts` — `handleNavigation`

`handleNavigation` has no cancellation mechanism. If the user clicks rapidly
between routes, multiple renders run concurrently. The last one to _complete_
(not the last one _initiated_) wins the DOM, so a slow earlier navigation can
overwrite a fast later one.

Related: `SpaHtmlRouter` creates one `AbortController` at `initialize()` for
the lifetime of the router, but individual navigations don't get their own
signals. `getData()` receives `context.signal` from `buildComponentContext`,
but this is `undefined` in SPA mode. Long-running `getData()` calls can't be
cancelled.

**Fix:** Per-navigation `AbortController` — abort the previous before starting
the next. Pass the signal through `buildComponentContext` so `getData()` can
observe cancellation.

**Source:** `1.0.0-beta.6.issues.md` #1, #15
