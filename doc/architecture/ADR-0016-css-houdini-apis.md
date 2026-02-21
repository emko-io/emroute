# ADR-0016: CSS Houdini APIs Evaluation

**Status**: Rejected
**Date**: 2026-02-17
**Decision Makers**: Development Team

## Context

emroute's CSS handling has several pain points that emerge from its dual
SSR/SPA rendering model and Shadow DOM architecture:

1. **Scoping mismatch** -- Widget CSS needs `@scope (widget-name)` wrapping for
   SSR light DOM output, but this is redundant inside SPA Shadow DOM. Widgets
   that bypass `WidgetComponent.renderHTML()` (counter-vanilla, counter-htm,
   code-block) miss `@scope` wrapping entirely, leaking styles globally in SSR.

2. **`:host` broken in SSR** -- `code-block.widget.css` uses `:host` selectors,
   which only work inside Shadow DOM. In SSR light DOM output, these styles
   simply don't apply.

3. **Page CSS is never scoped** -- `PageComponent.renderHTML()` injects CSS as a
   bare `<style>` tag. Pages render into `router-slot` (light DOM), so all page
   CSS is global. Authors must manually namespace selectors (`.about-page h1`).

4. **No CSS bundling** -- `deno bundle` only handles TypeScript. CSS is served
   as static files or embedded inline. Widget CSS requires a separate HTTP fetch
   per widget type on each page load (mitigated by caching).

5. **`router-slot` display conflict** -- JS sets `display: contents` as an
   inline style, which overrides any stylesheet rule for `router-slot`. No way
   to control display from CSS alone.

6. **No CSS HMR** -- Widget `.widget.css` file changes aren't even watched by
   the dev server. Only `.page.css` triggers route regeneration.

This ADR evaluates whether the CSS Houdini APIs could address these pain points.

## Houdini APIs Assessment

### CSS Properties and Values API (`@property` / `CSS.registerProperty()`)

**Browser support**: 94.7% global (Chrome 78+, Firefox 128+, Safari 16.4+, Edge
79+). Excellent -- this is production-ready.

**What it offers**: Typed custom CSS properties with defined syntax, initial
values, and inheritance behavior. Goes beyond `--var: value` by letting the
browser understand the property's type (`<color>`, `<length>`, `<number>`, etc).

**Relevance to emroute**: **Low-to-moderate.**

- The overlay service already uses CSS custom properties (`--overlay-surface`,
  etc.) for theming. `@property` would add type safety and initial values,
  making the theming contract more robust. But this is a minor convenience, not
  a pain point fix.
- Could define typed properties for widget-to-page communication (e.g., a
  widget declares `@property --widget-accent { syntax: '<color>'; inherits: true; }`),
  but this is a design pattern, not a framework concern.
- Does NOT help with scoping, bundling, HMR, or the SSR/SPA CSS mismatch.

**Verdict**: Nice-to-have for overlay theming. No architectural impact.

### CSS Typed Object Model (Typed OM)

**Browser support**: ~90% global (Chrome 66+, Edge 79+, Safari 16.4+, Firefox
limited). Good but Firefox gaps.

**What it offers**: `el.attributeStyleMap.set('display', 'contents')` instead of
`el.style.display = 'contents'`. Values are typed JS objects, not strings.

**Relevance to emroute**: **Negligible.**

- The `router-slot` display conflict is a specificity/architecture issue, not a
  string-vs-typed-value issue. Typed OM doesn't change specificity rules.
- emroute's CSS manipulation is minimal (a few inline style assignments). The
  string API is perfectly adequate.
- Does NOT help with scoping, bundling, or SSR.

**Verdict**: No benefit. Adds complexity for no gain.

### CSS Painting API (Paint Worklets)

**Browser support**: 80% global. **Not supported in Firefox or Safari.** This is
a Chromium-only feature in practice.

**What it offers**: JavaScript-driven custom painting via `paint()` CSS function.
Write a worklet class that draws on a canvas-like context, reference it in CSS
as `background-image: paint(my-painter)`.

**Relevance to emroute**: **None.**

- emroute is a routing/rendering framework, not a visual effects library.
- Paint worklets are for custom visual effects (patterns, gradients, borders).
  None of emroute's CSS pain points are about custom painting.
- Chromium-only breaks ADR-0006's cross-browser principle.
- Worklets run in a separate thread with no DOM access -- incompatible with
  SSR or any server-side rendering.

**Verdict**: Irrelevant. Wrong tool for the problem.

### CSS Layout API (Layout Worklets)

**Browser support**: Experimental. Chrome Canary only. No Firefox, no Safari.

**What it offers**: Custom layout algorithms (e.g., masonry).

**Relevance to emroute**: **None.** emroute doesn't control layout; consumers
do. Not even close to production-ready.

**Verdict**: Irrelevant and unusable.

### CSS Parser API / Font Metrics API

**Browser support**: Proposals only. No implementations in any browser.

**Relevance to emroute**: None. Vapor-ware.

## Decision

**Do not adopt CSS Houdini APIs as an architectural strategy.** The APIs that
are production-ready (`@property`, Typed OM) don't address emroute's actual CSS
pain points. The APIs that could theoretically help (Paint, Layout) have fatal
browser support gaps and are architecturally irrelevant to a routing framework.

### What actually helps emroute's CSS problems

The real pain points and their solutions lie in existing/emerging CSS standards,
not Houdini:

| Pain Point               | Better Solution                                                 |
| ------------------------ | --------------------------------------------------------------- |
| SSR/SPA scoping mismatch | `@scope` (already used), Declarative Shadow DOM (already used)  |
| `:host` broken in SSR    | Avoid `:host` in widget CSS; use `@scope` consistently          |
| Page CSS not scoped      | `@scope (.page-name)` wrapping (same pattern as widgets)        |
| No CSS bundling          | CSS module scripts, `import` assertions (future), or build step |
| `router-slot` display    | Use CSS layers or remove inline style, use `:defined`           |
| No CSS HMR               | Watch `.widget.css` files in dev server (implementation fix)    |

### Optional: `@property` for overlay theming

The overlay service MAY adopt `@property` declarations to formalize its custom
property contracts. This is a minor improvement, not an architectural decision:

```css
@property --overlay-surface {
  syntax: '<color>';
  inherits: false;
  initial-value: #fff;
}
```

This provides type checking and default values but changes nothing about how the
overlay system works.

## Consequences

### Positive

- Avoids adopting Chromium-only APIs that conflict with ADR-0006 (cross-browser,
  zero dependencies).
- Keeps the CSS strategy grounded in well-supported standards (`@scope`,
  Declarative Shadow DOM, CSS custom properties).
- Focuses effort on the actual fixes (dev server watch, consistent `@scope`
  wrapping, page CSS scoping).

### Negative

- No "magic bullet" for the SSR/SPA CSS duality -- the complexity is inherent to
  the dual-rendering model and must be managed through conventions.

### Neutral

- `@property` can be adopted incrementally for custom property contracts without
  any architectural commitment.

## References

- Code: `src/component/widget.component.ts:42-43` -- `@scope` wrapping
- Code: `src/util/html.util.ts:170-172` -- `scopeWidgetCss()`
- Code: `src/component/page.component.ts:61` -- unscoped page CSS injection
- Code: `src/element/slot.element.ts:33-35` -- `display: contents` inline style
- Code: `src/overlay/overlay.service.ts:62-68` -- CSS injection with custom properties
- Related ADRs: ADR-0006 (native APIs, zero dependencies)
- External: [CSS Houdini APIs (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Houdini_APIs)
- External: [CSS Paint API support (Can I Use)](https://caniuse.com/css-paint-api)
- External: [`@property` support (Can I Use)](https://caniuse.com/mdn-css_at-rules_property)

## Notes

### Why Houdini stalled

CSS Houdini was conceived ~2016 as a way to "explain CSS magic" by exposing
browser internals. In practice, only Chrome invested heavily. Firefox and Safari
implemented the simpler APIs (`@property`, partial Typed OM) but never shipped
Paint or Layout worklets. The useful parts of Houdini (`@property`) have been
absorbed into mainstream CSS specs. The ambitious parts (Paint, Layout, Parser)
remain Chromium-only or proposal-stage.

### The real CSS roadmap for emroute

The following standard CSS features are more impactful than Houdini:

- **`@scope`** (Chrome 118+, Firefox 128+, Safari 17.4+) -- already in use for
  widget CSS scoping. Should be extended to page CSS.
- **CSS Nesting** (Chrome 120+, Firefox 117+, Safari 17.2+) -- reduces need for
  preprocessors in companion CSS files.
- **`:defined` pseudo-class** (all browsers) -- style custom elements only after
  registration, preventing FOUC.
- **CSS Layers (`@layer`)** (Chrome 99+, Firefox 97+, Safari 15.4+) -- could
  solve the `router-slot` specificity conflict by layering framework defaults
  below consumer styles.
- **View Transitions API** (already used in `index.html` fixture) -- native
  page transition animations.
