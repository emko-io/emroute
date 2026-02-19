# HashRouter should use Navigation API instead of hashchange

## Problem

`HashRouter` uses the legacy `hashchange` event while the entire motivation
for hash routing in emroute was that the Navigation API treats hash changes as
first-class navigations. Using `hashchange` loses the key benefits:

1. **No abort of in-flight renders** — `handleHashChange` creates a new
   `AbortController` each time but never aborts the previous one. Rapid hash
   changes run all handlers concurrently. `SpaHtmlRouter` gets cancellation
   for free because the Navigation API aborts the previous signal.

2. **No per-entry state** — `navigation.currentEntry.getState()` is
   unavailable. Consumers can't store/retrieve state per hash route entry.

3. **`navigate()` is fire-and-forget** — `location.hash = ...` triggers
   `hashchange` asynchronously but returns immediately. Callers can't await
   render completion. `navigation.navigate()` returns `{ finished }`.

## Fix

Replace `hashchange` listener with `navigation.addEventListener('navigate', ...)`
filtering for `event.hashChange === true`:

```typescript
navigation.addEventListener('navigate', (event) => {
  if (!event.hashChange) return;

  const path = new URL(event.destination.url).hash.slice(1) || '/';

  event.intercept({
    handler: async () => {
      await this.handleHashNavigation(path, event.signal);
    },
  });
}, { signal });
```

`navigate()` becomes:

```typescript
async navigate(hash: string): Promise<void> {
  const target = hash.startsWith('#') ? hash : '#' + hash;
  const { finished } = navigation.navigate(location.pathname + target);
  await finished;
}
```

This gives abort signals, per-entry state, and awaitable navigation — matching
`SpaHtmlRouter` semantics and the original design intent.

## Also

- **BaseRenderer catch block** has a redundant `instanceof Response` check
  where both branches throw identically. Simplify to a single `throw`.
- **Slot attribution order** changed during `BaseRenderer` extraction
  (markdown wait now happens before slot attribution). This is a behavior
  fix but should be noted explicitly.
