# Widget SSR error rendering missing in `none` mode

## Problem

The `failing` widget on the About page throws in `getData()`, but no error
message renders in `none` mode. The widget silently produces no output.

## Expected

When a widget throws during SSR, the error should be rendered inline (e.g.,
using `renderError()`) so the page still communicates what went wrong, even
without JavaScript.

## Affected Modes

`none` — other modes may mask the issue via client-side error handling.

## Source

- `test/browser/fixtures/widgets/failing/failing.widget.ts`
- `src/component/widget.component.ts` — error handling path

## Resolution

**Resolved in 1.5.0.** `abstract.component.ts` implements `renderError()` returning
`<div class="c-error">` markup. `component.renderer.ts` catches widget errors and
calls `renderError()`. SSR widget resolution in `widget-resolve.util.ts` catches
and logs errors.
