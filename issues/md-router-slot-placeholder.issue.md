# ~~SSR markdown emits useless router-slot placeholder for leaf pages~~ — RESOLVED

SSR markdown renderer emits useless router-slot placeholder for leaf pages

When rendering an HTML-only page (e.g. about.page.html) through the markdown
SSR renderer, PageComponent.renderMarkdown() falls back to the
`` ```router-slot``` `` placeholder because there's no .md file. For leaf pages
with no children this placeholder is never replaced and appears in the output
as literal fenced code.

The HTML renderer doesn't have this problem — `<router-slot></router-slot>`
gets replaced or is naturally invisible in the browser.

**Resolution:** In `src/renderer/ssr/md.renderer.ts`, `renderRouteContent`
now checks if the rendered markdown is exactly the router-slot placeholder
block and returns empty string instead. The existing `if (markdown)` guard
in `renderPage` skips empty strings, so the placeholder never reaches the
output. Fixed in v1.0.0-beta.6.
