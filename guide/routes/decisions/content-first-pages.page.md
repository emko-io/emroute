# ADR-0007 · Content-First Pages

**Status**: Accepted

A page can be just `.page.md` or `.page.html` — no JavaScript required.
The framework's `DefaultPageComponent` provides a fallback chain so
static content needs zero code.

```
routes/
  about.page.md         ← drop a markdown file, done
```

Escalate to `.page.ts` only when you need data fetching, custom titles,
or dynamic rendering.

## Why

Documentation sites, blogs, marketing pages, READMEs-as-routes — none
of these need a class file per page. Forcing a TypeScript wrapper around
"here's some prose" is the kind of friction that pushes content people
away from frameworks.

The default fallback chain (`.html` → `.md` via `<mark-down>` →
`<router-slot>`) means most pages never touch TypeScript at all, while
the option to drop in `.page.ts` is always there.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0007-content-first-pages.md)
