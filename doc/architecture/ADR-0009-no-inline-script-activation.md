# ADR-0009: No Inline Script Activation

**Status**: Accepted
**Date**: 2026-02-08

## Context

`innerHTML` assignment does not execute `<script>` tags per the HTML spec. If a
component's `renderHTML()` returns content with `<script>` tags, they are
inserted into the DOM but never run in SPA mode. SSR HTML is unaffected because
scripts execute normally on full page load.

A clone-and-reinsert workaround exists (create new `<script>` elements from the
inert ones) but it introduces complexity and security surface.

## Decision

Do not auto-activate scripts in `innerHTML`. Components that need client-side
behavior should use custom elements and widgets instead.

Widgets already solve this: the counter-htm fixture proves that even third-party
renderers (Preact via htm) work inside a widget's `renderHTML()` without inline
scripts, using `queueMicrotask` to hydrate after DOM insertion.

## Consequences

### Positive

- No script injection surface in component rendering
- Simpler ComponentElement implementation
- Encourages the widget/custom-element model over inline scripts

### Negative

- Content authors cannot use `<script>` tags in `.page.html` files for SPA mode
- Third-party HTML snippets with inline scripts won't work out of the box

### Neutral

- SSR HTML mode is unaffected (full page load executes scripts normally)

## References

- Code: `src/element/component.element.ts`
- Related: `test/browser/fixtures/counter-htm.component.ts` (widget pattern)
- Issue: `issues/script-execution-innerhtml.issue.md`
