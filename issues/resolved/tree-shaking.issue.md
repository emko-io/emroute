# Tree Shaking Optimisations

All issues resolved.

## What was done

### 1. Consolidated custom element registration into `mod.ts`

Removed auto-registration from `slot.element.ts` and `markdown.element.ts`.
All custom element registration now happens in a single block in
`src/renderer/spa/mod.ts` — the batteries-included browser entry.

### 2. Trimmed main barrel to public API only

Removed 17 internal-only exports from `src/index.ts`. This dropped 4 modules
from the barrel's import graph (`route.matcher.ts`, `route.core.ts`,
`component.renderer.ts`, `widget.parser.ts`).

Remaining public API: `Component`, `PageComponent`, `WidgetComponent`,
`WidgetRegistry`, `DefaultPageComponent`, `escapeHtml`, and types.

### 3. `HTMLElementBase` side effect — resolved by #2

`HTMLElementBase` consumers (custom elements) are only imported via `./spa`,
not the main barrel. No action needed after #2.

### 4. Removed `toUrl` dual export path

Dropped the re-export from `route.core.ts`. SSR renderers now import `toUrl`
directly from `route.matcher.ts`.

### 5. Built-in widgets export classes, not instances

`PageTitleWidget` and `BreadcrumbWidget` now export classes. `mod.ts`
instantiates them, consistent with how `RouterSlot` and `MarkdownElement` are
handled.
