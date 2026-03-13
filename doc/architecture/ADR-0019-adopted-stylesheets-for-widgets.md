# ADR-0019: adoptedStyleSheets for Widget CSS

**Status**: Accepted
**Date**: 2026-03-13
**Resolved**: 2026-03-14

## Context

Widgets render inside shadow DOM. Companion CSS (`.widget.css` files) was
originally injected as `<style>` elements inside the shadow root — both during
SSR (via declarative shadow DOM) and client-side rendering (via
`setHTMLUnsafe()`).

Every call to `setHTMLUnsafe()` (initial render, `reload()`, SPA navigation)
destroys and recreates the `<style>` node, forcing the browser to re-parse CSS
and recalculate styles — even when the CSS hasn't changed.

The `adoptedStyleSheets` API offers an alternative: a `CSSStyleSheet` object
is created once, parsed once, and assigned to the shadow root. It survives DOM
mutations and can be shared across multiple shadow roots (e.g. 50 instances of
`widget-nav` share one sheet object in memory).

## Exploration

A working prototype was built on `experimental/adopted-stylesheets`.

### What was implemented

1. **SSR mock** (`src/util/html.util.ts`): `SsrCSSStyleSheet` mock with
   `replaceSync()`. `SsrShadowRoot.adoptedStyleSheets` serializes sheets as
   `<style>` tags in `innerHTML` — SSR output unchanged.

2. **CSS removed from `renderHTML()`** (`core/component/widget.component.ts`):
   `WidgetComponent.renderHTML()` no longer injects `<style>` from companion
   files. Returns content only.

3. **Element-layer CSS** (`src/element/component.element.ts`): `adoptCss()`
   method with a static `sheetCache` (keyed by widget name). Called once in
   `connectedCallback()` before both hydration and client-side render paths.

4. **SSR resolve path** (`core/util/widget-resolve.util.ts`): Injects `<style>`
   with `@scope`-wrapped CSS directly into the declarative shadow DOM template,
   since the resolve path is pure string concatenation (no mock shadow root).

### Verified across all four SPA modes

| Mode     | SSR `<style>` | `adoptedStyleSheets` | Sheet sharing |
|----------|---------------|----------------------|---------------|
| `none`   | Yes           | No (no JS)           | N/A           |
| `leaf`   | Yes           | Yes (hydration)      | Yes           |
| `root`   | Yes (initial) | Yes                  | Yes           |
| `only`   | No            | Yes                  | Yes           |

### The cascade priority problem

`adoptedStyleSheets` has **higher** cascade priority than `<style>` elements
in shadow DOM — per spec, not a browser quirk:

```
adoptedStyleSheets  >  <style> elements  (normal rules)
<style> elements    >  adoptedStyleSheets (!important rules — inverted)
```

This means companion CSS (via `adoptedStyleSheets`) silently overrides any
`<style>` tag a consumer places in their `renderHTML()` override — a footgun.

### Resolution: `@layer`

Wrapping companion CSS in `@layer emroute` puts it at the bottom of the cascade.
Layerless CSS (consumer `<style>` in `renderHTML()`) always wins over layered
CSS, regardless of specificity or source order:

```css
/* Framework companion CSS — in a layer, lowest priority */
@layer emroute {
  @scope (widget-nav) {
    .site-nav { color: blue; }
  }
}

/* Consumer <style> in renderHTML() — layerless, always wins */
.site-nav { color: red; }  /* wins */
```

Verified in Playwright: `consumerWins: true`.

## Decision

**Use `adoptedStyleSheets` with `@layer emroute` wrapping for widget companion
CSS.** The SSR `<style>` tag in declarative shadow DOM remains for no-FOUC
rendering before JS loads.

Pages are unaffected — they render in light DOM with plain `<style>` tags,
where source order handles the cascade naturally. No `@layer` needed.

### Dual CSS delivery

In modes with SSR, companion CSS is present twice after hydration: once as a
`<style>` from declarative shadow DOM, and once via `adoptedStyleSheets`. Both
are wrapped in `@layer emroute`, so they have identical priority. The
duplication is harmless (identical rules, no cascade conflicts) and ensures
no FOUC before JavaScript loads.

## Consequences

### Positive

- Consumer `<style>` in `renderHTML()` always overrides companion CSS.
- Sheet sharing across widget instances (one `CSSStyleSheet` per widget name).
- `adoptedStyleSheets` survives `setHTMLUnsafe()` — no CSS re-parse on re-render.
- `renderHTML()` returns content only — clean separation of concerns.

### Negative

- Companion CSS duplicated in SSR modes (SSR `<style>` + adopted sheet).
- Consumers who want their CSS in the `emroute` layer must explicitly use
  `@layer emroute` — an unusual requirement.

## References

- Branch: `experimental/adopted-stylesheets`
- Related: ADR-0016 (CSS Houdini APIs — rejected)
- Spec: [CSS cascade layers](https://www.w3.org/TR/css-cascade-5/#layering)
- Code: `src/element/component.element.ts`, `core/util/html.util.ts`
