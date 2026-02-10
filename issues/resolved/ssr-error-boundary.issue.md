# SSR renderers ignore error boundaries and root error handler

**Status**: Fixed.

## Problem

Both SSR renderers skipped the error boundary chain entirely. When a page threw
during SSR, the response was a hardcoded inline fallback instead of the
consumer's custom error handler. SPA had the full chain; SSR went straight to
`renderErrorPage()`.

## What was done

Both SSR renderers now mirror the SPA's `handleError` flow:

1. Try `findErrorBoundary(pathname)` — load module, call `renderHTML` /
   `renderMarkdown`
2. Try `getErrorHandler()` — load module, same
3. Fall through to inline fallback only if both fail

Error boundary/handler modules are loaded directly via `loadModule()` (not
through `renderRouteContent`, which expects a full `RouteConfig` with files).

### Files

- `src/renderer/ssr/html.renderer.ts` — `render()` catch block
- `src/renderer/ssr/md.renderer.ts` — `render()` catch block

### Tests

6 new unit tests covering both renderers:

- Root error handler renders on 500
- Scoped error boundary takes precedence over root handler
- Falls back to inline error when no handler exists

Browser tests updated to verify root error handler output.

### Not addressed

Error boundaries still receive no context about what went wrong (empty params,
no error object). This is consistent with the SPA renderer and tracked as a
separate concern.

**Source:** `1.0.0-beta.6.issues.md`
