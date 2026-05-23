# ADR-0001 · No Optional Params

**Status**: Accepted

emroute rejects optional route parameters (`[id?]`, `:id?`). To express
"the same view with and without an id," use `<router-slot>` with default
content in the parent route instead.

## Why

A "missing" parameter is never really missing — it carries an implicit
default that the component has to know about. Threading that default
through the URL pattern turns routing into a guessing game and leaks
component concerns into the router.

A parent route with a default child slot says exactly what's happening:
this layout has a body; if the URL specifies one, render it; otherwise
render the fallback.

```
routes/
  projects/
    index.page.ts     ← shows project list
    [id].page.ts      ← shows one project
```

`/projects` matches the index. `/projects/42` matches the dynamic child.
The router matches what's in the URL — nothing more.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0001-no-optional-params.md)
