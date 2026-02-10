No obvious way to write links that work in both SPA and SSR HTML modes

In SPA mode, links are unprefixed: /about, /projects/42
In SSR HTML mode, links need the /html/ prefix: /html/about, /html/projects/42

The SPA router already strips /html/ prefixes from intercepted links, so
writing /html/about works in both modes. But this forces SSR concerns into
component code — every href must be /html/-prefixed, which is ugly and
error-prone.

For /md/ links the SPA router redirects to the server, so those already work.

Possible solutions:

1. SSR HTML renderer post-processes output to prefix internal links with /html/.
   Components always write plain links (/about), the renderer rewrites
   href="/about" → href="/html/about" in SSR HTML context. Transparent to
   component authors. Simple regex or DOM-based rewrite.

2. Link helper function that components call:
   routeLink('/about', context) → '/about' in SPA, '/html/about' in SSR HTML.
   Requires passing render context to components (not currently available in
   renderHTML signature — only PageContext with files/params).

3. <route-link> custom element that resolves the correct href at render time.
   More framework-like, adds complexity.

4. Document "always write /html/ links" as the convention and rely on the SPA
   router stripping the prefix. Simple but leaks SSR into components.

Option 1 is the simplest — zero component-side changes, purely a renderer
concern.

## Reframe: rendering hints per link

Instead of treating the prefix mismatch as a problem, treat the prefix as an
intentional rendering hint. The consumer chooses per-link:

- href="/about" — SPA navigation, instant client-side transition
- href="/html/about" — SSR HTML, full server render (SPA strips prefix if it
  intercepts, so this degrades gracefully)
- href="/md/about" — raw markdown, SPA redirects to server

This lets a single page mix strategies: main navigation uses /html/ for SSR
reliability, interactive tabs use plain links for SPA-speed transitions. The
decision is per-link, not global.

This already works today — the SPA router strips /html/ on intercept and
redirects /md/ to the server. Just needs documentation.

---

Resolved: no code changes needed. Convention is to always use /html/ prefixed
hrefs for content-first routing. Omitting the prefix intentionally forces SPA
mode on a specific page — this is a feature, not a bug. Needs documentation
in the guide.
