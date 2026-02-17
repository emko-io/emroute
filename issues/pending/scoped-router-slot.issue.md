# Scoped Router Slot

## Problem

`injectSlot` replaces the **first** `<router-slot>` found in the accumulated HTML
string, regardless of which ancestor route produced it. This causes:

1. **Fall-through**: If a layout parent has no slot, child content lands in a
   grandparent's slot instead of being dropped with a warning.
2. **Out-of-order injection**: If markdown content produces a `<router-slot>` via
   `` ```router-slot `` AND default `renderHTML` appends another, two slots exist.
   Children fill them in wrong order.
3. **Shadow DOM leakage**: SSR regex `/<router-slot[^>]*><\/router-slot>/` matches
   slots inside `<template shadowrootmode="open">` — it doesn't respect DOM
   boundaries.

SPA has the same issue: `querySelector('router-slot')` finds the first one in DOM
order, not necessarily the one belonging to the direct parent.

## Partial Fix Applied

- **`isLeaf` check** in default `renderHTML`/`renderMarkdown`: leaf routes no
  longer append `<router-slot></router-slot>`. This eliminates duplicate slots
  from the default fallback chain.
- **Warning** added when `injectSlot` finds no slot (SSR) or
  `querySelector('router-slot')` returns null (SPA).

## Proposed: `data-route` Attribute for Scoping

Each `<router-slot>` carries a `data-route` attribute matching the route pattern
of the route that produced it. `injectSlot` targets only the matching slot.

```html
<!-- Root produces: -->
<router-slot data-route="/html"></router-slot>

<!-- Articles replaces that, produces its own: -->
<section>...</section>
<router-slot data-route="/html/articles"></router-slot>

<!-- Article detail replaces articles' slot specifically -->
```

Note: `data-ssr-route` already exists on the outer shell slot for hydration.
Consider whether to reuse the same attribute or keep them separate.

### Changes required

| File                   | Change                                                                  |
| ---------------------- | ----------------------------------------------------------------------- |
| `ssr.renderer.ts`      | `injectSlot` gains `parentRoute` param; loop passes `hierarchy[i-1]`    |
| `ssr/html.renderer.ts` | Regex targets `data-route="<parentRoute>"`; root slot gets attribute    |
| `ssr/md.renderer.ts`   | Slot block parameterized with route                                     |
| `spa/html.renderer.ts` | `querySelector` targets `router-slot[data-route="..."]`                 |
| `page.component.ts`    | Append `data-route` with current route pattern                          |
| `route.core.ts`        | `buildComponentContext` should expose current hierarchy level's pattern |

### Edge cases

- **Consumer code** writing bare `<router-slot></router-slot>` needs migration.
  Fallback: match unscoped slots with deprecation warning.
- **Markdown `` ```router-slot `` blocks**: user-authored slots would lack
  `data-route`, making them inert for hierarchy injection (good — separates
  user slots from framework slots).
- **Shadow DOM boundary**: even with `data-route`, the SSR regex still matches
  inside `<template>` tags. Consider excluding matches within `<template>` blocks.

## Alternative: Native `<template>` + `<slot>`

Investigation explored using native `<slot>` elements inside declarative shadow
DOM for scoped content projection. Each route level would be a host element with
its own shadow root containing `<slot>`.

### Advantages

- Perfect scoping — each shadow root has its own slot namespace
- Browser-native, no custom implementation needed
- Aligns with widget rendering (already uses `<template shadowrootmode="open">`)

### Concerns raised (and counterpoints)

- **CSS isolation**: Parent styles can't reach child content via `<slot>`.
  Counter: children are already independent; cascading styles should be global
  `.css` files loaded via `<link>`, not parent-scoped `<style>` tags.
- **SPA complexity**: `innerHTML` doesn't process `shadowrootmode`.
  Counter: `setHTMLUnsafe()` is already implemented in the codebase (fixtures
  not yet updated). It handles declarative shadow DOM in dynamic content.
- **SSR output**: Nested shadow trees vs flat HTML.
  Counter: with `shadowrootmode="open"`, content is accessible. Already using
  this pattern for widgets.
- **No `<slot>` in current widgets**: Widgets use `<template shadowrootmode>`
  but don't use native `<slot>` at all — opportunity to adopt.

### Open questions

- Would route-level shadow DOM break any existing patterns?
- How does `::slotted()` limitation (direct children only) affect layout styling?
- Can we incrementally adopt — route layouts use `<slot>`, leaf pages don't?
- Performance: many shadow roots per page vs one flat tree?

## Recommendation

Start with `data-route` scoping (simpler, non-breaking). Explore native `<slot>`
as a future direction when `setHTMLUnsafe()` is widely available.
