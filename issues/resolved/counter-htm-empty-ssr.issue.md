# counter-htm widget renders empty in SSR

## Problem

`counter-htm` widget's `renderHTML()` produces an empty `<div>` — the
`<noscript>` fallback exists but the SSR content itself is meaningless without
JS. In `none` mode, users see empty green boxes.

## Expected

`renderHTML()` should produce static content showing the initial count value,
so the widget is meaningful without JavaScript.

## Affected Modes

All modes (SSR output is empty in every mode), but most visible in `none`.

## Source

`test/browser/fixtures/widgets/counter-htm/counter-htm.widget.ts`

## Resolution

**Resolved in da8af71.** The `counter-htm` widget was removed from test fixtures
entirely. Remaining widgets produce meaningful SSR output.
