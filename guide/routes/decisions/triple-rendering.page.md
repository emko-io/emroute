# ADR-0003 · Triple Rendering

**Status**: Accepted

Every route renders in three contexts from a single component:

- `/app/*` — SPA shell, client-side rendered
- `/html/*` — SSR HTML for browsers and crawlers
- `/md/*` — SSR Markdown for LLMs, CLIs, and indexers

The component exposes `renderHTML()` and `renderMarkdown()` and runs the
same `getData()` for both.

## Why

Not every consumer is a browser. LLMs want markdown, not
`<div class="grid grid-cols-3">`. CLI scripts want plain text. Search
engines want HTML. Treating these as separate apps means three codebases
that drift.

One component, three audiences — and the markdown view is the most
honest representation of the page. If `/md/` looks empty, the page has
no real content.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0003-triple-rendering-context.md)
