# @scope in adoptedStyleSheets doesn't match inside shadow DOM

## Problem

Widget companion CSS is wrapped in `@scope (widget-name)` and applied via
`adoptedStyleSheets` on the shadow root. But `@scope (widget-name)` targets
the **host element tag name**, which doesn't exist inside the shadow tree —
the shadow root's children are the widget's rendered HTML, not the host
element itself.

Result: styles are adopted but no rules match. The widget renders unstyled.

## Reproduction

1. Create a widget with companion CSS (e.g., `follow-button.widget.css`)
2. Remove manual `<style>` injection from `renderHTML()`
3. Observe: `adoptedStyleSheets.length === 2` but computed styles are defaults

Inspecting the adopted sheet shows:
```css
@layer emroute {
  @scope (widget-follow-button) {
    .follow-btn { cursor: pointer; border-radius: 8px; ... }
  }
}
```

The `.follow-btn` inside the shadow root is never matched because
`@scope (widget-follow-button)` looks for a `widget-follow-button` element
inside the shadow tree, which doesn't exist — `widget-follow-button` is the
host.

## Expected behavior

Companion CSS should match elements inside the shadow root when applied via
`adoptedStyleSheets`. Since `adoptedStyleSheets` are already scoped to the
shadow root, the `@scope` wrapper is redundant.

## Possible fixes

### A. Use `@scope (:host)` instead of `@scope (tag-name)`

`:host` matches the shadow host from within the shadow tree:
```css
@layer emroute {
  @scope (:host) {
    .follow-btn { ... }
  }
}
```

### B. Remove `@scope` entirely for adopted sheets

`adoptedStyleSheets` are inherently scoped to the shadow root. The `@layer`
already controls cascade priority. No `@scope` needed:
```css
@layer emroute {
  .follow-btn { ... }
}
```

### C. Keep `@scope` only for SSR `<style>` tags

SSR injects `<style>` into declarative shadow DOM where `@scope` isn't needed
either (shadow DOM already isolates styles). But if there's a reason for
`@scope` in SSR, only apply it there — not in the `CSSStyleSheet` used for
`adoptedStyleSheets`.

## Testing across beta versions

### 1.12.0-beta.2

- `adoptedStyleSheets.length === 2` (host sheet + companion sheet)
- Companion CSS wrapped in `@scope (widget-follow-button)` — no rules match
- Styles present in sheet but computed styles are browser defaults
- Manual `<style>` injection in `renderHTML()` still works as fallback

### 1.12.0-beta.3

- `adoptedStyleSheets.length === 0` — no sheets adopted at all
- `@scope` removed from emroute.js (grep confirms 0 occurrences)
- But `adoptCss()` appears to not run — regression from beta.2
- Widget renders completely unstyled (no adopted sheets, no style tags)
- Worse than beta.2: at least beta.2 adopted sheets (even if rules didn't match)

### 1.12.0-beta.3 with dist/emroute.js (manual copy)

- `adoptedStyleSheets.length === 2`, `cursor: pointer` — **CSS works**
- `adoptCss` method exists on element, sheets adopted, styles applied
- No `@scope` wrapping — companion CSS applied directly in `@layer emroute`

### Root cause of beta.3 failure

`buildClientBundles()` generates its own `emroute.js` that **does not include
`adoptCss`**. The pre-built `dist/emroute.js` in the package has it. The two
files have different hashes:

- `buildClientBundles()` output: `f4431e9e...` (missing adoptCss)
- `dist/emroute.js`: `620f2e42...` (has adoptCss)

Manually copying `dist/emroute.js` after the build step makes everything work.

### Current workaround

After `buildClientBundles()`, copy `dist/emroute.js` over the generated one:
```ts
cpSync(resolve(createRequire(import.meta.url).resolve("@emkodev/emroute/package.json"), "../dist/emroute.js"), `${appRoot}/emroute.js`);
```

Or: keep manual `${css}` injection in `renderHTML()` if using the build-generated
`emroute.js`.

## Context

Discovered while testing emroute 1.12.0-beta.2/beta.3 with pathtor-ts. Two
separate issues:
1. beta.2: `@scope (tag-name)` doesn't match inside shadow DOM
2. beta.3: `buildClientBundles()` generates emroute.js without `adoptCss`
