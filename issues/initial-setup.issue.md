# Issues

## Issues Found During Setup

1. Pre-release-only package blocks deno add
   deno add jsr:@emkodev/emroute fails. You must know to specify @^1.0.0-beta.1. The error message from Deno is helpful, but a user discovering the package on JSR would hit this wall immediately.

2. JSR main package page is empty
   Visiting jsr.io/@emkodev/emroute (no version) shows nothing — no description, no README. The README only appears on jsr.io/@emkodev/emroute@1.0.0-beta.1. This is likely a JSR quirk with
   pre-release-only packages, but it means the first thing a user sees is a blank page.

3. No quick-start / hello-world example
   The guide is thorough but starts with philosophy and concepts. There's no "create these 3 files and run this command" quick-start. A user has to read the full guide to piece together: index.html +
   main.ts + routes/ + dev server entry point.

4. Dev server entry point is not obvious
   The guide shows createDevServer() but the CLI entry (server/cli.deno.ts) that provides a zero-config start isn't documented in the guide. A consumer doesn't know whether to write their own dev.ts or
   use the built-in CLI. The deno.json exports show ./server and ./server/deno but the CLI isn't exported.

5. entryPoint config is confusing
   The CLI defaults ENTRY_POINT to 'routes/index.page.ts' — this is not the SPA entry point (main.ts), it's... the index route? The guide's dev server example shows entryPoint: 'main.ts' which makes
   sense (it's the bundle entry), but the CLI default suggests the entry point is a route file. These two usages are contradictory and confusing.

6. deno bundle is experimental
   The dev server spawns deno bundle --watch which prints a warning: "deno bundle is experimental and subject to changes." This is fine for beta but worth noting — the framework's dev toolchain depends
   on an unstable Deno feature.

7. Generated manifest has ././ double-dot paths
   The moduleLoaders in the generated manifest produce paths like import('././routes/courses/[id].page.ts') — the ././ prefix is technically valid but looks like a bug. It comes from the generator
   prepending ./ to paths that already start with ./.

8. /md/courses renders the full parent hierarchy, not just courses
   Hitting /md/courses returns the index page markdown plus the courses markdown separated by ---. This is the nested route rendering working correctly, but it's unexpected for a markdown consumer who
   just wants the courses content. The guide doesn't explain this SSR markdown nesting behavior.

9. Missing permissions in docs
   The guide's dev server example doesn't mention that --allow-write and --allow-run are required (for manifest generation and deno bundle). A user copying the guide example would get permission errors.

10. MarkdownElement.setRenderer() not in the guide's dev server path
    The SPA setup section shows MarkdownElement.setRenderer(...) as required, but for the dev server flow, markdown pages render fine in SSR without it. It's unclear when you actually need to set a
    renderer vs when the defaults work.

11. MarkdownIsland vs MarkdownElement naming inconsistency
    The docs say MarkdownIsland.setRenderer() but the actual class is MarkdownElement. The SPA module exports MarkdownElement, and the source code defines class MarkdownElement. The guide also uses
    MarkdownElement in the SPA setup section. But markdown-renderer.md uses MarkdownIsland throughout — that symbol doesn't exist.

12. Import path unclear for markdown setup
    The markdown renderer doc imports from '@emkodev/emroute' (root), but MarkdownElement is only exported from '@emkodev/emroute/spa'. A user following the markdown doc would get an import error.

13. No guidance on when you need a renderer
    Right now our .page.md files work in SSR markdown mode without any renderer (the <mark-down> element is bypassed). But in SPA mode, clicking a link to a markdown page would throw "No markdown
    renderer configured." The docs don't make this tradeoff clear — you only discover you need one when you test the SPA in-browser.

14. AstRenderer was not exported from @emkodev/emko-md/parser in beta.1.\
    The published 0.1.0-beta.1 on JSR was missing the export { AstRenderer, escapeHtml } from "./ast-renderer.ts" line in mod.ts, even though the source code in the repo had it. You fixed it in beta.2.

15. WASM distribution story is unclear for JSR consumers. The vanilla-app used import.meta.resolve + local paths which only works with local imports. When consuming from JSR, you have to know
    the CDN URL pattern (https://jsr.io/@emkodev/emko-md/{version}/hypertext-parser/pkg/hypertext_parser_bg.wasm) and hardcode the version. The package should either document this or export a constant\
    with the WASM URL.

16. Hardcoded WASM version. The WASM URL in both dev.ts and src/emko.renderer.ts has the version baked in (0.1.0-beta.2). If the package updates, you have to update the URL manually in\
    multiple places. There's no import.meta.resolve-based solution for JSR packages.

17. Title doesn't update for non-ts routes. Navigating to /about still shows "Courses — Pathtor" (the previous page's title). The .page.md route has no way to set a title since there's no
    component with getTitle(). The DefaultPageComponent returns undefined for title, so the previous title persists.

18. Root index always renders as parent of all routes. Every page shows the index content ("Pathtor / Welcome... / Courses / About") above the actual page content. The root index.page.md acts
    as a layout wrapper since all routes are children of /. This is technically correct per the nested routing model, but it's surprising — most users would expect index.page.md to be the homepage
    content, not a persistent layout. The guide should clarify that root index.page.* becomes a layout shell, and you need a separate layout file if you want different behavior.

---

## Document issues

File-Based Routing section — The line "Root index.page.* matches / exactly (no catch-all)" is misleading. It should clarify that root index still acts as a layout parent for all routes (renders with
<router-slot> that children fill). "Exact match" refers to URL matching, not the rendering hierarchy.

Development Server section — Two things:

- entryPoint needs clarification — it's the bundle entry (main.ts), not a route file. The CLI defaulting to routes/index.page.ts contradicts this.
- Missing permissions: example should include --allow-write and --allow-run (needed for manifest generation and deno bundle).

SPA Setup section — Should state explicitly that MarkdownElement.setRenderer() is required for .page.md routes to render in SPA mode. Without it, markdown pages show raw text or throw. Currently
reads as optional.

Markdown renderer doc (doc/markdown-renderer.md) — Uses MarkdownIsland which doesn't exist; should be MarkdownElement. Import path shown as '@emkodev/emroute' but MarkdownElement is only exported
from '@emkodev/emroute/spa'.

---

## Resolution log

1. external — JSR/Deno behavior, not emroute's problem.
2. external — JSR quirk with pre-release-only packages.
3. resolved — Added doc/quick-start.md, linked from README and guide.
4. open — CLI not exported as public entry point.
5. resolved — CLI default changed from routes/index.page.ts to main.ts.
6. external — Deno's issue, not actionable.
7. resolved — Fixed in tool/route.generator.ts, strip leading ./ before prepending.
8. documented — By-design nested routing. Documented root index layout behavior in guide.
9. resolved — Added --allow-write and --allow-run to guide, CLI comment, and deno.json dev task.
10. resolved — Added "When do you need a renderer" callout in guide SPA Setup section.
11. resolved — Replaced all MarkdownIsland references across docs.
12. resolved — Fixed import paths in markdown-renderer.md, architecture.md, README.reference.md.
13. resolved — Added callout in guide SPA Setup section.
14. external — Fixed in emko-md beta.2, not an emroute issue.
15. documented — Addressed by doc/setup-emko-md.md (vendor approach).
16. documented — Addressed by doc/setup-emko-md.md (version in filename).
17. open — See issues/title-not-updating.issue.md
18. resolved — Documented in guide Nested Routes section. Fixed misleading "no catch-all" line.

Document issues — all resolved:

- File-Based Routing: clarified root index layout parent behavior.
- Development Server: fixed entryPoint default, added missing permissions.
- SPA Setup: added renderer requirement callout.
- Markdown renderer doc: MarkdownIsland → MarkdownElement, import paths fixed.
- Three File Types: added .ts + .html + .md composition example.
