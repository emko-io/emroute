# Widget links should be context-aware

**Status**: Resolved by design.

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

---

## Resolution

The original premise was wrong. Widgets don't need render context awareness.

`/html/` is the canonical prefix for all widget links — SSR HTML is the
preferred rendering mode (islands architecture, progressive enhancement, works
without JS). This is not a limitation; it's the intended default.

The SPA click handler (`src/renderer/spa/html.renderer.ts:98-100`) does NOT
intercept `/html/` links — it returns early and lets the browser do a full
navigation to the SSR endpoint:

```ts
if (link.pathname.startsWith(SSR_HTML_PREFIX) || link.pathname.startsWith(SSR_MD_PREFIX)) {
  return;
}
```

SPA only handles bare-path links. This means:

- **SSR HTML**: `/html/` links work natively
- **SPA**: `/html/` links trigger full navigation to SSR (correct — user gets
  server-rendered HTML with islands)
- **SSR Markdown**: `/md/` links are a niche case — anyone wanting them would
  set them explicitly

No code changes needed. The router controls link behavior, widgets stay simple.
