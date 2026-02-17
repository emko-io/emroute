# Replace innerHTML with setHTMLUnsafe

## Goal

Replace all `innerHTML` assignments used for DOM injection with
`setHTMLUnsafe()` — the Baseline 2025 successor that additionally parses
Declarative Shadow DOM templates into real shadow roots.

## Rationale

`innerHTML` silently ignores `<template shadowrootmode="open">` at runtime.
With external companion HTML files (widget library scenario), nested widgets
using DSD won't hydrate correctly. `setHTMLUnsafe` parses DSD templates into
real shadow roots, enabling nested widget composition in fetched HTML.

Also enables future Trusted Types CSP policies.

## What Changes

### SPA Renderer (`src/renderer/spa/html.renderer.ts`)

- `currentSlot.innerHTML = html` → `currentSlot.setHTMLUnsafe(html)`
- Applies to: `renderPage`, `renderStatusPage`, `handleError`

### ComponentElement (`src/element/component.element.ts`)

- `this.shadowRoot!.innerHTML = html` → `this.shadowRoot!.setHTMLUnsafe(html)`
- Applies to: `render()` method (lines 327, 332, 339)

### SSR Mock (`src/util/html.util.ts`)

- `SsrShadowRoot` — add `setHTMLUnsafe(html: string)` as alias for innerHTML
  setter (server-side, no DSD parsing needed — it's string concatenation)
- `SsrHTMLElement` — same

### ADR-0006 Update

- Update the "APIs used" list: `innerHTML` → `setHTMLUnsafe`

## Out of Scope

- Sanitization of external companion files (separate issue)
- `setHTML()` adoption (not Baseline yet)
- `SanitizerConfig` (not Baseline yet)

## References

- ADR-0015: Use setHTMLUnsafe for DOM Injection
- ADR-0006: Native APIs, Zero Dependencies
- [ShadowRoot.setHTMLUnsafe (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/setHTMLUnsafe)
- [Element.setHTMLUnsafe (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Element/setHTMLUnsafe)
