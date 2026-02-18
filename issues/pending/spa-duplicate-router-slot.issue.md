# SPA mode produces duplicate router-slots for markdown layout pages

## Problem

When a non-leaf `.md` page contains a `` ```router-slot``` `` fenced block,
`PageComponent.renderHTML` produces two `<router-slot>` elements:

1. Inside `<mark-down>` — from the fenced block rendered by the markdown element
2. Outside `<mark-down>` — from the `${slot}` suffix appended by the fallback

```html
<mark-down>
  <widget-nav>...</widget-nav>
  <router-slot></router-slot> ← from markdown content
  <h1>Footer</h1>
</mark-down>
<router-slot></router-slot> ← from fallback suffix
```

The SPA router attributes both with the same pattern. Child content goes into
the first one (inside `<mark-down>`), leaving the second empty. This is harmless
but wasteful — and before the timing fix (moving `attributeSlots` after
`waitForMarkdownRender`), the SPA router couldn't find the slot inside
`<mark-down>` at all, causing child content to appear after the layout footer.

SSR doesn't have this problem because `stripSlots` removes empty
`<router-slot>` tags from the final output.

## Current hotfix

`page.component.ts` checks ``files.md.includes('```router-slot')`` to skip the
external slot when the markdown already defines one. This is a string match on
raw markdown content — fragile (could false-match inside code blocks or inline
code) but sufficient for the common case.

## Proper fix

Add slot deduplication to the SPA renderer, mirroring SSR's `stripSlots`:

After the `renderPage` loop completes, scan for empty `<router-slot>` elements
and remove them. The challenge: both slots have the same `pattern` attribute, so
the SPA renderer needs to distinguish "consumed" (has content) from "unconsumed"
(empty). A simple `el.innerHTML.trim() === ''` check would work.

```ts
// After renderPage loop, before hydration:
for (const slot of this.slot.querySelectorAll('router-slot[pattern]')) {
  if (slot.innerHTML.trim() === '') {
    slot.remove();
  }
}
```

This would make the hotfix in `page.component.ts` unnecessary — the duplicate
slot would be created but immediately cleaned up, matching SSR behavior.

## Related changes

- `src/renderer/spa/html.renderer.ts` — moved `attributeSlots` after
  `waitForMarkdownRender` so the SPA router finds `<router-slot>` inside
  rendered `<mark-down>` content (timing fix, stays regardless of this issue)
- `src/component/page.component.ts:74-82` — hotfix with JSDoc marker
