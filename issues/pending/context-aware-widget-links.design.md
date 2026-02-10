# Widget links should be context-aware

Widgets (nav, breadcrumbs, etc.) generate links, but the correct href depends
on how the page was loaded:

- **SSR HTML** (`/html/*`): links need `/html/` prefix
- **SSR Markdown** (`/md/*`): links need `/md/` prefix
- **SPA** (bare path): links should be bare paths

Currently the nav widget hardcodes `/html/` prefixed links. This works for SSR
HTML but produces wrong links in SPA mode (the SPA has to strip the prefix) and
doesn't cover SSR Markdown at all.

**Approach:** Define widget links with `/html/` prefix by default (progressive
enhancement — works without JavaScript). In SPA mode, strip the prefix. For SSR
Markdown, render links with `/md/` prefix. Widgets need access to the rendering
context (spa, html, md) so they can adjust hrefs accordingly.

Open: whether the context should be implicit (derived from the request path) or
explicit (passed through `ComponentContext`), and how it affects hydration and
link consistency across renderers.

**Source:** `spa-intercepts-ssr-links.issue.md` #2
