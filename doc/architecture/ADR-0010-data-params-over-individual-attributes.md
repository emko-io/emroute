# ADR-0010: Raw Attributes for Component Params

**Status**: Accepted
**Date**: 2026-02-08

## Context

ComponentElement originally read params from a single `data-params` JSON blob.
Three alternatives were considered:

1. **`data-params` JSON blob** — one attribute, all types preserved, but verbose
2. **`data-*` attributes via dataset API** — avoids namespace collisions but
   adds unnecessary `data-` prefix overhead
3. **Raw HTML attributes** — cleanest syntax, standard HTML pattern

Option 2 was briefly adopted but reconsidered: custom elements like
`<widget-page-title>` render no visible content, so global attribute side
effects (e.g., `title` tooltip) are irrelevant. For the rare collision
(`class`, `id`, `style`), the dual behavior is arguably correct — setting
`class` on a widget both styles it and makes it a param.

## Decision

Use raw HTML attributes. ComponentElement reads all attributes (skipping only
the internal `data-ssr`), converts kebab-case names to camelCase, and
JSON.parse's each value with string fallback.

Fenced widgets in markdown stay JSON — keys become raw attributes:

````
```widget:page-title
{"title": "About Us"}
````

````
Generates:
```html
<widget-page-title title="About Us"></widget-page-title>
````

In `.page.html`, authors write attributes directly:

```html
<widget-page-title title="About Us"></widget-page-title>
<c-counter start="0"></c-counter>
```

Type coercion: each attribute value is JSON.parse'd; if that fails, it stays
a string:

- `count="42"` → `42` (number)
- `active="true"` → `true` (boolean)
- `tags='["a","b"]'` → `["a","b"]` (array)
- `name="hello"` → `"hello"` (string, JSON.parse fails, kept as-is)

Kebab-case attribute names are converted to camelCase:

- `coin-id="bitcoin"` → `{ coinId: "bitcoin" }`

## Consequences

### Positive

- Natural HTML pattern — `<c-counter start="0">` instead of
  `<c-counter data-params='{"start":"0"}'>`
- Fenced widget JSON is unchanged — content authors notice nothing
- DevTools show individual params in the element inspector
- No artificial `data-` prefix clutter

### Negative

- HTML global attribute side effects on custom elements (tooltip from
  `title`, etc.) — practically irrelevant since widgets/components control
  their own rendering
- Complex values still need JSON-in-attributes for non-string types

### Neutral

- `data-ssr` is the only skipped attribute (internal framework use)

## References

- Code: `src/element/component.element.ts` (connectedCallback)
- Code: `src/util/html.util.ts` (processFencedWidgets)
- Issue: `issues/component-params-attributes.design.md`
