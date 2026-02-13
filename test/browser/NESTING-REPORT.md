# Nesting Test Report

Server: `deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys test/browser/start-server.ts`
Port: 4100

## Test Fixtures

### Uniform nesting (same file combo at every level)

Three variants, each with 4 levels: root → lvl-one → level-two → level-three.

| Variant              | Files per level           | Directory                 |
| -------------------- | ------------------------- | ------------------------- |
| `nesting` (original) | `.page.html` + `.page.md` | `routes/nesting/`         |
| `nesting-ts-html`    | `.page.ts` + `.page.html` | `routes/nesting-ts-html/` |
| `nesting-ts-md`      | `.page.ts` + `.page.md`   | `routes/nesting-ts-md/`   |

All `.ts` files extend `PageComponent` with no overrides (only `name` and `getData`).

Each `.html` template has `<router-slot></router-slot>` between BEFORE/AFTER markers.
Each `.md` file has `` ```router-slot\n``` `` fenced block between BEFORE/AFTER markers.
Leaf level (level-three) has no `<router-slot>` / fenced block.

### Mixed nesting (ts-only parents, mixed leaves)

| Variant      | Directory            |
| ------------ | -------------------- |
| `nesting-ts` | `routes/nesting-ts/` |

Parent levels (root, lvl-one, level-two): `.page.ts` only, with just `name` defined (no overrides).
Three leaf pages under `level-three/`:

| Leaf         | File         | Notes                                     |
| ------------ | ------------ | ----------------------------------------- |
| `typescript` | `.page.ts`   | overrides `renderHTML` + `renderMarkdown` |
| `markdown`   | `.page.md`   | markdown file only                        |
| `html`       | `.page.html` | html file only                            |

## Results by Variant

### `nesting` (.html + .md, no .ts)

| Route                                    | SSR Markdown                  | SSR HTML                      | SPA                           |
| ---------------------------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| `/nesting`                               | nesting                       | nesting                       | nesting                       |
| `/nesting/lvl-one`                       | nesting → lvl-one             | nesting → lvl-one             | nesting → lvl-one             |
| `/nesting/lvl-one/level-two`             | nesting → lvl-one → level-two | nesting → lvl-one → level-two | nesting → lvl-one → level-two |
| `/nesting/lvl-one/level-two/level-three` | all 4                         | all 4                         | all 4                         |

All modes correct.

### `nesting-ts-html` (.ts + .html, no .md)

PageComponent subclasses with no overrides.

| Route                                            | SSR Markdown | SSR HTML                      | SPA                           |
| ------------------------------------------------ | ------------ | ----------------------------- | ----------------------------- |
| `/nesting-ts-html`                               | root only    | nesting                       | nesting                       |
| `/nesting-ts-html/lvl-one`                       | root only    | nesting → lvl-one             | nesting → lvl-one             |
| `/nesting-ts-html/lvl-one/level-two`             | root only    | nesting → lvl-one → level-two | nesting → lvl-one → level-two |
| `/nesting-ts-html/lvl-one/level-two/level-three` | root only    | all 4                         | all 4                         |

SSR HTML: all levels correct.
SSR Markdown: only root renders — **expected**, these pages have no `.md` files so `renderMarkdown` falls back to a bare `` ```router-slot\n``` `` placeholder with zero visible content.
SPA: all levels correct.

### `nesting-ts-md` (.ts + .md, no .html)

PageComponent subclasses with no overrides.

| Route                                          | SSR Markdown                  | SSR HTML                      | SPA                           |
| ---------------------------------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| `/nesting-ts-md`                               | nesting                       | nesting                       | nesting                       |
| `/nesting-ts-md/lvl-one`                       | nesting → lvl-one             | nesting → lvl-one             | nesting → lvl-one             |
| `/nesting-ts-md/lvl-one/level-two`             | nesting → lvl-one → level-two | nesting → lvl-one → level-two | nesting → lvl-one → level-two |
| `/nesting-ts-md/lvl-one/level-two/level-three` | all 4                         | all 4                         | all 4                         |

All modes correct.

### `nesting-ts` (ts-only parents, mixed leaves)

Parent levels are ts-only — no `.html` or `.md` files. `renderHTML` falls back to bare `<router-slot>`, `renderMarkdown` falls back to `` ```router-slot\n``` ``. Parents are transparent passthrough slots in all modes.

| Route            | SSR Markdown         | SSR HTML               | SPA                    |
| ---------------- | -------------------- | ---------------------- | ---------------------- |
| `.../typescript` | `.ts renderMarkdown` | `.ts renderHTML`       | `.ts renderHTML`       |
| `.../markdown`   | `.md file` content   | `.md` rendered to HTML | `.md` rendered to HTML |
| `.../html`       | root only (no .md)   | `.html` file content   | `.html` file content   |

All modes correct. The `html` leaf showing root-only in SSR Markdown is expected (no `.md` file, same as `nesting-ts-html`).

## Summary

| Combo                               | SSR Markdown              | SSR HTML | SPA |
| ----------------------------------- | ------------------------- | -------- | --- |
| `.html` + `.md` (no .ts)            | OK                        | OK       | OK  |
| `.ts` + `.html` (no .md)            | expected (no .md content) | OK       | OK  |
| `.ts` + `.md` (no .html)            | OK                        | OK       | OK  |
| `.ts` only (parents) + mixed leaves | OK                        | OK       | OK  |

No bugs. All rendering pipelines work correctly.

The "root only" SSR Markdown result for pages without `.md` files is expected: `PageComponent.renderMarkdown()` falls back to `` ```router-slot\n``` `` when no `.md` file exists. Each level produces only a slot marker with no visible content, leaving only the root page's actual markdown.

## Other Observations

- SSR HTML correctly nests all variants at all depths.
- The original `nesting` variant (html+md, no ts) uses `<mark-down>` elements that provide an additional `<router-slot>` path from the `.md` fenced block.
- For `.ts` + `.html` pages, the `<router-slot>` in the `.html` template is the only slot, and the SPA router fills it correctly at all depths via the `renderPage` loop.
- Ts-only parent pages (no `.html`, no `.md`) produce bare `<router-slot>` / `` ```router-slot\n``` `` fallbacks and act as transparent passthrough wrappers.
- Test server must be restarted to pick up new route files (watch mode only rebuilds the bundle).
