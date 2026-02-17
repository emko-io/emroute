# Dead code: c-loading, c-markdown, c-error CSS classes

## Problem

`abstract.component.ts` defines three CSS class constants (`c-loading`,
`c-markdown`, `c-error`) used in default `renderHTML()` and `renderError()`
output. No stylesheet in the framework or fixtures provides styles for them.

- `c-loading` — wraps "Loading..." when data is null. Never shows in SSR (data
  resolved before render). In SPA the widget element handles its own state.
- `c-markdown` — wraps escaped markdown for conversion. The `data-markdown`
  attribute on the same div is what actually triggers conversion, not the class.
- `c-error` — wraps error messages. Also used by `markdown.element.ts`. The only
  one with real semantic value, but still unstyled.

## Scope

- Remove `CSS_LOADING`, `CSS_MARKDOWN` constants and their class usage
- Evaluate whether `CSS_ERROR` should stay (it has cross-file usage in
  `markdown.element.ts`) or be replaced with a simpler approach
- Update tests in `test/unit/abstract.component.test.ts` that assert on these
  class names

## Source

- `src/component/abstract.component.ts:18-20` — constants
- `src/component/abstract.component.ts:148,157,199` — usage in render methods
- `src/element/markdown.element.ts:106` — `CSS_ERROR` usage
- `test/unit/abstract.component.test.ts` — test assertions
