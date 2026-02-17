# Guide tabs rely on inline JS in `none` mode

## Problem

The guide page tabs use inline `onclick` handlers to switch content. In `none`
mode, no JS bundle is served — but inline handlers are still JavaScript. This
contradicts the principle that `none` mode should be fully functional without
any JavaScript, using only native browser capabilities.

## Expected

Tabs should work without JS using a progressive enhancement pattern. Options:

- **`<details>`/`<summary>`** — native disclosure widget, no JS needed
- **`:target` selector** — anchor links + CSS `:target` to show/hide panels
- **Radio button hack** — hidden radio inputs + `:checked` sibling selectors

JS-enhanced tabs (smoother transitions, ARIA management) can layer on top in
`leaf`/`root`/`only` modes.

## Affected Modes

`none` — tabs work but violate the zero-JS contract.
