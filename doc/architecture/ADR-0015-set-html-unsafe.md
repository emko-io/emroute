# ADR-0015: Use setHTMLUnsafe for DOM Injection

**Status**: Accepted
**Date**: 2026-02-17
**Decision Makers**: Development Team

## Context

emroute injects HTML into the DOM in two places:

1. **SPA page rendering** — `currentSlot.innerHTML = html` in the router
2. **Widget rendering** — `this.shadowRoot!.innerHTML = html` in ComponentElement

Both use `innerHTML`, which has a critical limitation: it does not parse
`<template shadowrootmode="open">` into shadow roots. Declarative Shadow DOM
templates are treated as inert `<template>` elements.

Additionally, widgets support companion HTML files via `files` overrides,
including external URLs (`http://`, `https://`). This HTML is fetched, passed
through `context.files.html`, and injected via `shadowRoot.innerHTML`. With a
planned widget library, external companion files become a realistic scenario
where content is not fully under the application author's control.

`setHTMLUnsafe()` is Baseline September 2025 — supported in all modern browsers.
The safe variant `setHTML()` and the `SanitizerConfig` parameter are not yet
Baseline.

## Decision

Replace `innerHTML` assignments with `setHTMLUnsafe()` for DOM injection in the
SPA renderer and ComponentElement.

- `element.setHTMLUnsafe(html)` for router slot content
- `shadowRoot.setHTMLUnsafe(html)` for widget shadow root content

This is a direct replacement — no sanitizer parameter, no polyfill, no fallback.
Browsers without `setHTMLUnsafe` get full-page SSR navigation, which already
works (progressive enhancement).

Sanitization of external companion HTML files is a separate concern to be
addressed independently (manual stripping at the `loadFile` boundary, or
`setHTML()`/`SanitizerConfig` when they reach Baseline).

## Consequences

### Positive

- **DSD parsing at runtime** — nested widgets in companion HTML files produce
  real shadow roots without requiring custom element constructors to fire first
- **Trusted Types compatible** — `setHTMLUnsafe` accepts `TrustedHTML`, enabling
  CSP `require-trusted-types-for 'script'` policies in the future
- **Aligns with platform direction** — `innerHTML` is the legacy API;
  `setHTMLUnsafe` is its intended successor for programmatic HTML injection
- **No polyfill needed** — Baseline September 2025

### Negative

- **No sanitization benefit** — `setHTMLUnsafe` without a sanitizer is
  functionally identical to `innerHTML` for security. External content
  sanitization must be handled separately.

### Neutral

- API name contains "Unsafe" which may confuse contributors unfamiliar with the
  naming convention (the "unsafe" refers to no mandatory XSS stripping, not that
  the method itself is dangerous with trusted content)
- ADR-0006 lists `innerHTML` as a core API — this supersedes that specific line

## References

- Code: `src/renderer/spa/html.renderer.ts` — SPA slot injection
- Code: `src/element/component.element.ts` — widget shadow root injection
- Code: `src/element/component.element.ts:246-261` — external file loading
- Related ADRs: ADR-0006 (Native APIs, Zero Dependencies)
- External: [ShadowRoot.setHTMLUnsafe (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/setHTMLUnsafe)
- External: [Element.setHTMLUnsafe (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Element/setHTMLUnsafe)
