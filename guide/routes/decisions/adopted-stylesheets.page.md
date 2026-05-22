# ADR-0019 · adoptedStyleSheets for Widget CSS

**Status**: Accepted

Use `adoptedStyleSheets` for widget companion CSS in the browser,
wrapped in `@layer emroute`. Keep an SSR `<style>` tag inside the
declarative shadow root for no-FOUC first paint.

## Why

`adoptedStyleSheets` solves two real problems:

1. **`setHTMLUnsafe()` survival.** When the SPA swaps a widget's shadow
   content, an adopted stylesheet stays attached. An inline `<style>`
   would be wiped and re-parsed on every render.
2. **One sheet, N instances.** A single `CSSStyleSheet` object is
   adopted by every instance of a widget — parsed once, shared by all.

The `@layer emroute` wrapper fixes a cascade footgun: without it,
adopted styles silently override consumer styles in `renderHTML()`.
With it, consumer styles always win when they target the same selector.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0019-adopted-stylesheets-for-widgets.md)
