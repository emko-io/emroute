# ADR-0019: adoptedStyleSheets for Widget CSS

**Status**: Postponed
**Date**: 2026-03-13

## Context

Widgets render inside shadow DOM. Currently, companion CSS (`.widget.css` files)
is injected as `<style>` elements inside the shadow root — both during SSR
(via declarative shadow DOM `<template shadowrootmode="open">`) and client-side
rendering (via `setHTMLUnsafe()`).

This means every call to `setHTMLUnsafe()` (initial render, `reload()`, SPA
navigation) destroys and recreates the `<style>` node, forcing the browser to
re-parse CSS and recalculate styles — even when the CSS hasn't changed.

The `adoptedStyleSheets` API offers an alternative: a `CSSStyleSheet` object
is created once, parsed once, and assigned to the shadow root. It survives DOM
mutations and can be shared across multiple shadow roots (e.g. 50 instances of
`widget-nav` share one sheet object in memory).

## Exploration

A working prototype was built on `experimental/adopted-stylesheets`:

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

### What was verified

- All 714 unit tests pass.
- Browser tests pass (same pre-existing failures as main).
- Playwright confirmed `adoptedStyleSheets` applied in `root` mode: all widgets
  showed `adoptedCount: 1` with correct CSS rules, alongside SSR `<style>` tags.
- Verified across all four SPA modes:

| Mode     | SSR `<style>` | `adoptedStyleSheets` | Sheet sharing |
|----------|---------------|----------------------|---------------|
| `none`   | Yes           | No (no JS)           | N/A           |
| `leaf`   | Yes           | Yes (hydration)      | Yes           |
| `root`   | Yes (initial) | Yes                  | Yes           |
| `only`   | No            | Yes                  | Yes           |

### The dealbreaker: cascade priority

Playwright testing revealed that `adoptedStyleSheets` has **higher** cascade
priority than `<style>` elements in shadow DOM — per spec, not a browser quirk.

```
adoptedStyleSheets  >  <style> elements  (normal rules)
<style> elements    >  adoptedStyleSheets (!important rules — inverted)
```

This means companion CSS (via `adoptedStyleSheets`) silently overrides any
`<style>` tag a consumer places in their `renderHTML()` override. A consumer
writing explicit inline styles would see them ignored with no obvious reason —
the companion `.css` file wins via an invisible mechanism.

This violates the principle that `renderHTML()` output is explicit and
controllable. The current `<style>` injection keeps everything in the same
cascade layer, and later `<style>` tags naturally override earlier ones.

## Decision

**Keep `<style>` tag injection in `renderHTML()`.** Do not use
`adoptedStyleSheets` for companion CSS delivery.

The cascade priority issue makes this a footgun for consumers. The benefits
(sheet sharing, re-render durability) are real but situational, while the
confusion cost applies to every consumer who combines companion CSS with
custom styles.

### For consumers who need sheet sharing

The pattern is available manually for the rare case of 100+ instances of
the same widget:

```typescript
class MyWidget extends WidgetComponent<Params, Data> {
  static sheet: CSSStyleSheet;

  override hydrate(args: this['HydrateArgs']): void {
    if (!MyWidget.sheet) {
      MyWidget.sheet = new CSSStyleSheet();
      MyWidget.sheet.replaceSync(args.context.files.css);
    }
    this.element.shadowRoot.adoptedStyleSheets = [MyWidget.sheet];
    // Optionally remove SSR <style> to avoid duplication:
    // this.element.shadowRoot.querySelector('style')?.remove();
  }
}
```

This keeps the opt-in explicit and visible.

## Consequences

### Positive

- `renderHTML()` stays explicit — consumers control everything they see.
- No hidden cascade priority surprises.
- No breaking change to widget CSS behavior.

### Negative

- Repeated `<style>` tags per widget instance (memory cost for many instances).
- `setHTMLUnsafe()` re-parses CSS on every render cycle.
- Consumers who need sheet sharing must implement it themselves.

## References

- Branch: `experimental/adopted-stylesheets`
- Related: ADR-0016 (CSS Houdini APIs — rejected)
- Spec: [CSS `adoptedStyleSheets` cascade order](https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets)
- Code: `src/element/component.element.ts`, `core/component/widget.component.ts`
