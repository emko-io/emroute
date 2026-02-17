# Widget No-JS Audit

## Problem

`none` mode serves zero JavaScript, but several fixture widgets render empty or
broken content without JS. Widgets should produce useful SSR output on their own,
or explicitly indicate that JS is required.

## Audit of Test Fixture Widgets

### Works without JS

- `content-tab` — uses inline `onclick` handlers (works)
- `breadcrumb` — pure SSR, no JS needed
- `page-title` — pure SSR, no JS needed
- `nav` — pure SSR, no JS needed
- `external` — pure SSR

### Broken without JS

- `counter-htm` (Preact) — renders empty `<div>`, has `<noscript>` fallback but
  the SSR content itself is an empty green box. Fix: render the initial count
  value as static HTML in `renderHTML()`.
- `search-filter` — inline `oninput` can't cross shadow boundary (see
  shadow-dom-cross-boundary-queries.issue.md). Fix: use GET form pattern.
- `failing` — always throws. In `none` mode the error should still render.

### Needs review

- `counter` — check if SSR output is meaningful
- `clock` — likely needs JS for live updates, should show static timestamp
- `article-list` — check SSR output
- All other fixture widgets

## Recommendation

1. Every widget's `renderHTML()` should produce meaningful static content
2. Widgets that require JS should use `<noscript>` with a clear message
3. Document the pattern in the consumer guide
4. Consider a `static` flag or convention for widgets that are pure SSR
