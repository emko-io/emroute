# ADR-0004 · File-Based Routing

**Status**: Accepted

Routes are defined by the contents of `routes/`. Filename conventions
drive the entire routing model:

- `[id]` segments → `:id` dynamic params
- Directory structure → URL hierarchy
- `.page.ts` > `.page.html` > `.page.md` precedence
- A manifest of routes is generated at build time

No central route file. No decorators. No JSX tree.

## Why

Centralized route config is the first thing that drifts from reality.
When the source of truth is "files on disk," adding a route is `git add`
and the router catches up automatically. Renaming, deleting, and moving
behave exactly as developers already expect filesystem operations to
behave.

This is the convention every modern framework converged on (Next, Astro,
SvelteKit, Remix) for good reason — emroute just leans into it harder by
making the filesystem the *only* source.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0004-file-based-routing.md)
