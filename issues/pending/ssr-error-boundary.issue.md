# SSR renderers ignore error boundaries and root error handler

Both SSR renderers (`SsrHtmlRouter`, `SsrMdRouter`) skip the error boundary
chain entirely. When a page throws during SSR, the response is a hardcoded
inline fallback instead of the consumer's custom error handler.

## Current behavior

**SPA** — full chain works:

```
1. findErrorBoundary(pathname)   → scoped .error.ts component
2. getErrorHandler()             → root index.error.ts component
3. inline fallback               → <h1>Error</h1><p>{message}</p>
```

**SSR HTML** (`src/renderer/ssr/html.renderer.ts:96-108`) — skips to inline:

```
1. (skipped)
2. (skipped)
3. renderErrorPage()             → <h1>Error</h1><p>{message}</p>
```

**SSR Markdown** (`src/renderer/ssr/md.renderer.ts:84-96`) — same:

```
1. (skipped)
2. (skipped)
3. renderErrorPage()             → # Internal Server Error
```

## Impact

A consumer creates `routes/projects/[id].error.ts` and `routes/index.error.ts`
expecting consistent error pages across all three contexts. In SSR, those files
are silently ignored and users see a raw fallback with no branding.

## Secondary issue: error boundaries receive no context

The SPA renderer calls error boundary components with empty params and no error
information:

```ts
// src/renderer/spa/html.renderer.ts:429-430
const data = await component.getData({ params: {} });
const html = component.renderHTML({ data, params: {} });
```

The boundary has no way to know what went wrong or which route failed. It can
only render a generic message.

## Fix

Both SSR renderers should mirror the SPA's `handleError` flow:

1. Try `findErrorBoundary(pathname)` — load module, call `renderHTML` /
   `renderMarkdown`
2. Try `getErrorHandler()` — same
3. Fall through to inline fallback only if both fail

All three renderers should pass error context to the boundary component (the
error object and the failing pathname) so it can render a meaningful message.

## Blocked by

Route context rework (in progress) — the fix touches the same rendering paths.

## Files

- `src/renderer/ssr/html.renderer.ts` — `render()` catch block
- `src/renderer/ssr/md.renderer.ts` — `render()` catch block
- `src/renderer/spa/html.renderer.ts` — `handleError()` (reference impl)
