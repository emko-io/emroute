# ADR-0002: Wildcard Routes via Directory Index Convention

**Status**: Implemented
**Date**: 2026-02-07
**Decision Makers**: Development Team

## Context

Most routers support wildcard/catch-all routes (`/*`, `:rest+`) that match any
number of remaining path segments. During a feature comparison, wildcards were
identified as a gap in emroute.

The typical justifications are:

1. **CMS/docs slug matching** — `/docs/api/routes/dynamic` all resolve to one
   component that parses the slug and renders accordingly.
2. **404 catch-all** — match anything that didn't match a specific route.
3. **Subtree delegation** — one component owns an entire subtree regardless of
   depth.

However, emroute's file-based routing already covers most of these. The
file tree defines the route tree. Status pages (`404.page.md`) handle
unmatched URLs. Nested routes with `<router-slot>` handle subtree
composition.

The one genuine gap is a dynamic subtree — content whose depth isn't known at
build time and isn't mirrored in the filesystem. A docs viewer, a CMS page
renderer, a wiki. One component needs to match `/docs/anything/at/any/depth`.

## Decision

emroute will use the **existing distinction between flat files and
directory index files** to express wildcards. No new file naming syntax needed.

| File                   | Pattern          | Matches                                   |
| ---------------------- | ---------------- | ----------------------------------------- |
| `crypto.page.ts`       | `/crypto`        | `/crypto` only                            |
| `crypto/index.page.ts` | `/crypto/:rest*` | `/crypto`, `/crypto/eth`, `/crypto/a/b/c` |

A flat file (`name.page.ts`) is a leaf route — exact match only.

A directory index file (`name/index.page.ts`) is a subtree root. It matches its
own path and any deeper unmatched path. The remaining segments are available in
params as `rest`.

Specific children still take priority. `crypto/eth.page.ts` generates
`/crypto/eth`, which is more specific and matches first. The index catches
everything else.

If the matched component's `renderHTML` does not output a `<router-slot>`, the
router stops composing nested children. The component owns everything it matched.

### Implementation

`filePathToPattern` changes:

```
crypto.page.ts       → /crypto       (unchanged)
crypto/index.page.ts → /crypto/:rest*  (was: /crypto)
```

The `rest` param is empty string for `/crypto`, `"eth"` for `/crypto/eth`,
`"a/b/c"` for `/crypto/a/b/c`. When a specific child route exists, it matches
first due to specificity sorting — static and single-param patterns always
outrank wildcards.

## Consequences

### Positive

- **No new syntax**: The flat file vs directory index distinction already exists
  in the filesystem. It gains semantic meaning rather than being purely
  organizational.
- **Opt-in per route**: Only directory index files become catch-alls. Flat files
  remain exact-match. A route author chooses the behavior by choosing the file
  structure.
- **Composable with children**: Specific children (`crypto/eth.page.ts`) still
  work and take priority. The index is the fallback for unmatched children.
- **No slot = stop**: A component without `<router-slot>` naturally claims
  its entire matched subtree. No additional configuration needed.
- **Consistent with URLPattern**: `:rest*` is standard URLPattern syntax. No
  custom matching logic.

### Negative

- **Subtle convention**: The behavioral difference between `crypto.page.ts` and
  `crypto/index.page.ts` is not immediately obvious. Developers need to learn
  that directory structure is semantic, not just organizational.
- **Existing index files become catch-alls**: Any `dir/index.page.ts` that
  previously only matched its exact path will now also match deeper URLs. This
  is acceptable since the router has no published consumers yet.

### Neutral

- The `rest` param is always present in directory index routes (as empty string
  for the root match). Components that don't use it can ignore it.

## References

- Code: `emroute/src/route.matcher.ts` — `filePathToPattern`,
  `sortRoutesBySpecificity`
- Related: ADR-0001 (No Optional Params) — the router-slot default content
  pattern works alongside this. A directory index can render slot fallback
  content for the "no child selected" case, and catch-all content for unmatched
  deeper paths.
- Code: `vanilla-app/routes/crypto/` — existing example of directory index with
  children

## Notes

### Alternatives Considered

1. **`[...rest].page.ts` spread syntax** — explicit catch-all file like
   Next.js/SvelteKit. Adds a new naming convention instead of leveraging the
   existing flat-vs-directory distinction. More explicit but more syntax to
   learn.

2. **Implicit from missing slot** — any route without `<router-slot>`
   automatically catches deeper paths. This would require the router to inspect
   rendered output to decide matching behavior, coupling rendering to routing.
   Matching must happen before rendering.

3. **Configuration flag on component** — `static catchAll = true` on the
   PageComponent class. Moves routing concerns into component code. The
   filesystem should be the single source of truth for route patterns.

### Design Philosophy

The filesystem convention `[param]` → `:param` already gives file naming
semantic meaning. This decision extends the same principle: directory structure
(flat file vs directory with index) determines route matching behavior. The
filesystem is the router configuration — no annotations, no config objects, no
magic comments.
