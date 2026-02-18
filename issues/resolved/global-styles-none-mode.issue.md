# Global styles needed in main.css for `none` mode

## Problem

In `none` mode there is no JS to load component styles. Important global styles
(loading indicators, error states, layout defaults) are currently either inline
in widgets or absent entirely. Without JS, these styles never apply.

## Expected

Styles that matter without JS should live in `main.css` so they're available
via the `<link>` tag in the HTML shell. This includes styles for `c-loading`,
`c-error`, `c-markdown` classes used by `abstract.component.ts`, and any
widget styles that need to work in `none` mode.

## Affected Modes

`none` primarily. Also relevant for initial SSR paint in `leaf`/`root` before
JS loads.

## Resolution

**Resolved in 1.5.0.** `test/browser/fixtures/main.css` includes complete global
styles: overlay CSS (modals, toasts, popovers), `noscript` fallback styles, base
body styles, and widget container setup. All styles load via `<link>` tag in the
HTML shell — no JS required.
