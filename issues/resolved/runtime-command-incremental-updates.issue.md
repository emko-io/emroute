# Runtime command() should incrementally update manifests and artifacts

## Problem

`command()` only handles writes under `routesDir/` (auto-merges into the route
manifest). Writes under `widgetsDir/` and `elementsDir/` don't update their
manifests. Additionally, none of the three directories handle:

- **Deletion** — removing a file leaves a dangling manifest entry
- **Content changes** — editing a source `.ts` or companion file leaves the
  built `.js` module stale (old transpiled code, old inlined companions)

This breaks the CMS experience where files are written at runtime via
`runtime.command()` without a full server rebuild.

## Current behavior

| Action | Routes | Widgets | Elements |
|--------|--------|---------|----------|
| File created | Manifest updated | Manifest stale | Manifest stale |
| File deleted | Manifest stale (dangling ref) | Manifest stale | Manifest stale |
| File content changed | Manifest OK, `.js` stale | Manifest OK, `.js` stale | Manifest OK, `.js` stale |

## Expected behavior

`command()` detects which directory the write targets and performs an
incremental update — no full rescan, no server rebuild.

### Manifest updates

- `routesDir/` → `mergeRouteIntoManifest()` (exists, needs delete support)
- `widgetsDir/` → `mergeWidgetIntoManifest()` (new, flat list by module path)
- `elementsDir/` → `mergeElementIntoManifest()` (new, flat list by module path)

Each reads the stored manifest, adds/updates/removes the single entry, writes
it back, and clears the in-memory cache.

For deletes: detect via `DELETE` method or empty/missing body. Remove the
entry from the manifest. For routes, prune the node from the tree (and any
empty parent nodes).

### Artifact re-transpilation

When a source `.ts` or companion file (`.html`, `.md`, `.css`) is written,
re-transpile the affected module:

1. Read the source `.ts`
2. Call `runtime.transpile(source)` to produce `.js`
3. Read companion files and inline as `export const __files`
4. Write the merged `.js` back via `handle()` (not `command()` — avoid recursion)

This is the same logic as `transpileAndMerge` in `build.util.ts`, but runs
at the runtime level for individual files.

### Companion file detection

A write to `widgets/counter/counter.widget.css` should trigger re-merge of
`widgets/counter/counter.widget.ts` → `counter.widget.js`. The runtime needs
to detect that a companion file changed and find its parent module.

Pattern: if the written path matches `{dir}/{name}/{name}.widget.{html|md|css}`
or `{dir}/{name}/{name}.element.{html|md|css}`, find and re-transpile the
corresponding `.ts`/`.js` module.

## Scope

All changes are in `runtime/abstract.runtime.ts` — the `command()` method and
new private helpers. No changes to concrete runtimes, server, or build utils.

## Test plan

Use BunSqliteRuntime (in-memory, no filesystem, fully isolated).

### Routes

- Write `routes/about.page.ts` → query `routes.manifest.json` → tree has `about` node with `.ts` path
- Write `routes/about.page.html` (companion) → query built `.js` → contains `__files.html`
- Update `routes/about.page.ts` content → query built `.js` → contains new transpiled code
- Update `routes/about.page.html` content → query built `.js` → `__files.html` has new content
- Delete `routes/about.page.ts` → query manifest → `about` node removed
- Delete `routes/about.page.html` → query built `.js` → `__files` no longer has `html`

### Widgets

- Write `widgets/counter/counter.widget.ts` → query `widgets.manifest.json` → has `counter` entry
- Write `widgets/counter/counter.widget.css` → query built `.js` → `__files.css` present
- Update `widgets/counter/counter.widget.ts` → query built `.js` → updated code
- Update `widgets/counter/counter.widget.css` → query built `.js` → updated `__files.css`
- Delete `widgets/counter/counter.widget.ts` → query manifest → `counter` entry removed
- Delete `widgets/counter/counter.widget.css` → query built `.js` → no `__files.css`

### Elements

- Write `elements/code-editor/code-editor.element.ts` → query `elements.manifest.json` → has entry
- Update `elements/code-editor/code-editor.element.ts` → query built `.js` → updated code
- Delete `elements/code-editor/code-editor.element.ts` → query manifest → entry removed

### Edge cases

- Write file with non-matching name pattern (e.g. `routes/readme.txt`) → manifest unchanged
- Write widget without hyphen in name → manifest unchanged, warning logged
- Delete last route → manifest is empty tree `{}`
- Delete last widget → manifest is empty array `[]`
- Write to a dir not matching routes/widgets/elements → no manifest side effects

## Affected scenarios

- CMS writing pages via BunSqliteRuntime
- Dev server with file watching
- Any runtime where files change after initial `createEmrouteServer()`

## Resolution

Fully implemented in 1.8.0. `command()` handles all three directories (routes, widgets, elements) — creation, deletion, content changes, companion file detection, manifest updates, and retranspilation. Resolved 2026-03-05.
