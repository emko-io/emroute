# Recursive widget resolution loads the same module repeatedly

## Problem

When a widget's `renderHTML` output contains another `<widget-*>` tag (including
itself), `resolveRecursively` calls `resolveWidget` → `loadModule` at each depth
level. For a self-referencing widget hitting MAX_WIDGET_DEPTH=10, the same module
is loaded 10 times in a single render pass — 10 Blob creations + 10 dynamic
imports.

With the SW intercepting fetches, these are cache lookups (not network hits), but
the Blob + import overhead is unnecessary.

## Observed

`failing.widget.js` fetched ~20 times on a two-page session (10 per render pass
× 2 page loads). `nav.widget.js` fetched multiple times across page renders for
the same reason — `resolveWidget` has no deduplication within a render.

## Fix

Memoize `getWidget` per render pass in `renderRouteContent`. A `Map<string,
Promise<Component | undefined>>` scoped to the closure — not a persistent cache,
just deduplication within one render call:

```typescript
// html.renderer.ts
const resolved = new Map<string, Promise<Component | undefined>>();
const getWidget = (name: string) => {
  if (!resolved.has(name)) {
    resolved.set(name, this.resolveWidget(name));
  }
  return resolved.get(name)!;
};
```

Same pattern applies to `md.renderer.ts`.

## Impact

Low — correctness is fine, it's a performance issue. Visible as redundant
requests in DevTools network tab (served from SW cache, not actual network).
