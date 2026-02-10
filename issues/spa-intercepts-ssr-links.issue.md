# SPA router intercepts SSR links

## Problem

Two related issues with how SSR and SPA handle navigation links.

### 1. SPA intercepts SSR links

When an SSR HTML page (`/html/*`) is loaded, the SPA JavaScript bundle
initializes and starts intercepting all internal link clicks — including
links to other SSR routes (`/html/*`, `/md/*`).

Clicking a nav link like `/html/blog` while on `/html/blog` causes the SPA
router to strip the `/html/` prefix and navigate to `/blog` in SPA mode.
This breaks the SSR experience: the nav widget disappears (it was
SSR-rendered with `data-ssr`), and subsequent navigation is handled by the
SPA instead of full page loads to SSR endpoints.

The `/html/` and `/md/` prefixes are a convention — they signal SSR
rendering mode. If the link author intended SPA navigation, they would use
the bare path (e.g., `/blog`) without the prefix. A link to `/html/blog`
explicitly requests an SSR page load.

**Location:** `src/renderer/spa/html.renderer.ts` — click handler.

**Fix:** Add a guard to skip interception when the href starts with
`/html/` or `/md/`.

### 2. Widget links should be context-aware

Widgets (nav, breadcrumbs, etc.) generate links, but the correct href
depends on how the page was loaded:

- **SSR HTML** (`/html/*`): links need `/html/` prefix
- **SSR Markdown** (`/md/*`): links need `/md/` prefix
- **SPA** (bare path): links should be bare paths

Currently the nav widget hardcodes `/html/` prefixed links. This works for
SSR HTML but produces wrong links in SPA mode (the SPA has to strip the
prefix) and doesn't cover SSR Markdown at all.

**Approach:** Define widget links with `/html/` prefix by default (works
without JavaScript — progressive enhancement). In SPA mode, strip the
prefix when the page was loaded as a bare path. For SSR Markdown, render
links with `/md/` prefix. The rendering context should inform link
generation — this applies to all widgets, not just nav.

This means widgets need access to the rendering context (spa, html, md) so
they can adjust link hrefs accordingly.

> **Note:** The design for context-aware widget links is not final and
> requires a deep dive into consequences — how it affects hydration, link
> consistency across renderers, widget API surface, and whether the context
> should be implicit (derived from the request path) or explicit (passed
> through the component context).
