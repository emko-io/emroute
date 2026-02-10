Title doesn't update for non-ts routes

Navigating to a .page.md or .page.html route keeps the previous page's title.
DefaultPageComponent.getTitle() returns undefined, so document.title is never
updated. The SPA router's updateTitle() fallback also finds nothing — there's
no <title> element in the rendered HTML.

The .page.ts routes work fine because custom components override getTitle().

Possible approaches:

- Widget/directive in markdown to declare page metadata (title, etc.)
- <title> tag in .page.html files already works via updateTitle() fallback
- Frontmatter parsing (heavy, doesn't fit the custom element model)
- Auto-extract from content (fragile, makes assumptions about structure)

---

Resolved: added built-in widget-page-title widget (src/widget/page-title.widget.ts).
Sets document.title directly from params, renders no visible output.
Auto-registered when @emkodev/emroute/spa is imported.
