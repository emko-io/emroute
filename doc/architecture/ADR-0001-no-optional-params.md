# ADR-0001: No Optional Route Parameters

**Status**: Accepted
**Date**: 2025-02-07
**Decision Makers**: Development Team

## Context

Most routers (wouter, preact-iso, @solidjs/router) support "optional parameters"
in route patterns — e.g. `/users/:id?` matches both `/users/5` and `/users/`.

During a comparison of emroute against other routers, optional params were
identified as a feature gap. The question is whether emroute should adopt
this pattern.

The common justification is the locale prefix scenario: `/:locale?/about` matches
both `/en/about` and `/about`, avoiding duplicate route definitions.

However, "optional" is a misnomer. The parameter is never truly absent — it has an
implicit default. `/about` doesn't mean "no locale", it means "the default locale."
The router hands you `undefined` and you fill in the default yourself in component
code. This leaks a routing concern into business logic.

More fundamentally, the router has no reason to know about parameters that aren't in
the URL. When the URL is `/crypto`, the path segments are `["/", "crypto"]`. The
router matches against what exists. It should not speculatively consider that
`["/", "crypto", "eth"]` _could_ exist — that's a different URL entirely.

## Decision

emroute will **not** implement optional route parameters. Instead, the
existing **router-slot default content** pattern covers the real use cases.

A parent route defines a `<router-slot>` with fallback content. When a child route
matches, its content replaces the slot. When no child matches, the fallback renders.

Example — `/crypto` with optional child:

```html
<!-- crypto.page.html (parent layout) -->
<h1>Crypto Dashboard</h1>
<router-slot>Select a cryptocurrency for details.</router-slot>
```

```markdown
<!-- crypto/eth.page.md (child route) -->

### Ethereum Details
```

- `/crypto` — renders the parent page, slot shows "Select a cryptocurrency."
- `/crypto/eth` — renders the parent page, slot replaced with Ethereum content.

The parent page always renders. The child is additional content that fills a slot.
No param is "optional" — the parent route simply has a content slot that may or may
not be filled by a child route.

## Consequences

### Positive

- **No ambiguity**: The router matches what's in the URL, nothing more. `/crypto` is
  not a degraded `/crypto/:id?` — it's its own route.
- **No undefined params in components**: Components never receive `undefined` for a
  param they're expected to handle. If the param is in the URL, it's there. If not,
  a different route (or the parent's fallback) handles it.
- **No duplicate files**: The parent page handles "no child selected" via slot
  default content. No need for both `users.page.ts` and `users/[id?].page.ts`.
- **Content-first**: The fallback message is declared in the template (HTML/Markdown),
  not in routing logic or component code.
- **Consistent with file-based routing**: File paths map 1:1 to URL patterns. A file
  named `[id].page.ts` always means a required segment.

### Negative

- **Diverges from convention**: Developers coming from other routers may expect
  optional param support and need to learn the slot pattern.
- **Locale prefix scenario**: `/:locale?/about` cannot be expressed as a single route.
  Requires either a redirect (`/about` -> `/en/about`) or middleware-level locale
  detection before routing.

### Neutral

- The slot default content pattern already exists and is used in production
  (e.g. the crypto dashboard in vanilla-app).

## References

- Code: `vanilla-app/routes/crypto.page.html` — slot default content example
- Code: `vanilla-app/routes/crypto.page.md` — Markdown equivalent
- Code: `vanilla-app/routes/crypto/eth.page.md` — child route filling the slot
- Related: `emroute/doc/router-comparison.md` — feature comparison with other
  routers

## Notes

### Alternatives Considered

1. **Optional params (`[id?]`)**: Adds pattern matching complexity, produces
   `undefined` params that components must handle, and conflates "no child route"
   with "a param that happens to be missing."

2. **Default params in component**: `readonly defaults = { locale: 'en' }` declared
   on PageComponent. Cleaner than `undefined` but still encodes routing concerns
   in component logic. The router shouldn't need to know about defaults.

3. **Duplicate route files**: `users.page.ts` and `users/[id].page.ts` both exist.
   Leads to code duplication and divergence risk.

### Design Philosophy

The router's job is to match what's in the URL and render the corresponding
hierarchy. If a URL segment isn't there, it isn't there — the router doesn't
speculate about what _could_ be there. Parent routes with slot fallback content
handle the "nothing selected yet" state naturally, at the template level, without
routing tricks.
