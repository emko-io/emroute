# SPA Router: initController is orphaned

## Problem

In `src/renderer/spa/html.renderer.ts`, the initial navigation on `start()` creates
a local `AbortController` that is never stored or aborted:

```typescript
const initController = new AbortController();
await this.handleNavigation(
  location.pathname + location.search + location.hash,
  initController.signal,
);
```

If `dispose()` is called while the initial navigation is in-flight, the render
continues to completion after disposal. The old History API code used
`this.navigationController` which was aborted in `dispose()`.

For Navigation API–triggered navigations, the API provides its own signal via
`event.signal`, so those are properly cancelled. Only the initial render (which
bypasses the Navigation API) is affected.

## Suggested fix

Use `this.abortController.signal` (which already exists and is aborted in
`dispose()`) instead of creating a local controller:

```typescript
await this.handleNavigation(
  location.pathname + location.search + location.hash,
  this.abortController.signal,
);
```
