# Widget Data Prefetch

## Problem

Widgets are interactive islands — web components that call `getData()` client-side to fetch their data, then render. This works for SPA mode, but falls short for server-rendered modes:

- **SSR Markdown**: Widgets must render as markdown on the server. No client-side JS. `getData()` must run server-side.
- **SSR HTML**: Widgets render as `<widget-*>` custom elements that hydrate client-side. The HTML arrives with empty widget shells that pop in once JS loads and data fetches complete. Bad for initial paint and SEO — crawlers see "Loading..." placeholders.

## Idea

Gather all widgets across the entire route hierarchy, call `getData()` on the server in parallel, then use the results differently per renderer:

| Renderer         | Server `getData()` | Widget Output                                                                                                              |
| ---------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **SPA**          | No                 | `<widget-name data-params='...'>` — island fetches its own data                                                            |
| **SSR HTML**     | Yes                | `<widget-name data-params='...' data-ssr='{"prefetched":"data"}'>` — island hydrates with pre-fetched data, skips re-fetch |
| **SSR Markdown** | Yes                | Rendered markdown string from `widget.renderMarkdown({ data, params })`                                                    |

For SSR HTML, the widget element still hydrates as an interactive island. But instead of showing "Loading..." and then fetching, it receives the data as `data-ssr` attribute and renders immediately. The island's event handlers, reactivity, and `reload()` still work after hydration. First paint has real content.

`ComponentElement` already supports this — SSR hydration in `connectedCallback`:

```typescript
const ssrAttr = this.getAttribute('data-ssr');
if (ssrAttr) {
  try {
    this.data = JSON.parse(ssrAttr);
    this.state = 'ready';
    this.render();
    this.signalReady();
    return; // skip getData()
  } catch {
    // SSR data invalid - fall through to client fetch
  }
}
```

## What main branch did

The old `vanilla-app/dev-server.ts` had a `composeWidgets()` function that handled this for markdown context:

```typescript
async function composeWidgets(markdown: string, context: RenderContext): Promise<string> {
  const blocks = parseWidgetBlocks(markdown);
  if (blocks.length === 0) return markdown;

  const widgetsByName = await loadWidgetsManifest();

  const results = await Promise.all(
    blocks.map(async (block) => {
      const entry = widgetsByName.get(block.widgetName);

      // HTML context: just output custom element, no server-side data
      if (context === 'html') {
        const paramsJson = escapeHtml(JSON.stringify(block.params));
        return [block, `<${entry.tagName} data-params='${paramsJson}'>`] as const;
      }

      // Markdown context: import widget module, call getData(), renderMarkdown()
      const module = await import(entry.modulePath);
      const widget: Component = module.default;
      const data = await widget.getData({ params: block.params });
      return [block, widget.renderMarkdown({ data, params: block.params })] as const;
    }),
  );

  return replaceWidgetBlocks(markdown, new Map(results));
}
```

Key aspects:

- Widget modules were imported server-side via dynamic `import()`
- `getData()` ran on the server for markdown context
- All widgets were fetched in parallel (`Promise.all`)
- For HTML context, it only output custom elements — no prefetching
- This lived in the app's dev server, not in the router

What was lost in the refactor: the server-side `getData()` call for widgets in markdown SSR. What was never implemented: prefetching for HTML SSR.

## SSR HTML: three options

SPA and SSR Markdown are straightforward — client-side only and server-side only, respectively. SSR HTML is the design decision:

### A. Full island mode (current)

Server outputs `<widget-name data-params='...'>`. Widget hydrates client-side, calls `getData()`, renders. No server-side data.

- (+) Simple. No server-side widget resolution needed.
- (+) Widget always has fresh data.
- (-) SEO sees "Loading..." placeholders. No content until JS runs.
- (-) Layout shift when widgets pop in after hydration.

### B. Prefetch as initial state

Server calls `getData()`, outputs `<widget-name data-params='...' data-ssr='{"prefetched":"data"}'>`. Widget hydrates instantly with pre-fetched data but remains interactive — can `reload()`, respond to events, re-fetch.

- (+) SEO sees real content. No layout shift on first paint.
- (+) Widget is still fully interactive after hydration.
- (-) Complex. Server must resolve widget modules, run `getData()`, serialize results.
- (-) Data may be stale by the time JS hydrates (race between server render time and client load time).
- (-) HTML is larger (data embedded twice: in rendered HTML and in `data-ssr` attribute).

**Surgical hydration variant:** Instead of the client replacing the widget's
entire `innerHTML` on hydration, the server could also call `renderHTML()` and
embed the result. The client then compares or surgically updates only the
elements whose data has changed — e.g. updating a `textContent` or attribute
rather than replacing the whole DOM subtree. This avoids the flash of
re-rendering identical content and preserves any DOM state (scroll position,
focus, selection) inside the widget. The trade-off is that the client needs a
diffing or binding strategy to map data fields to DOM nodes, which adds
complexity to the widget contract.

### C. Static server render (no hydration)

Server calls `getData()` and `renderHTML()`. Output is plain HTML, not a custom element. No client-side JS for this widget. Want fresh data? Refresh the page.

- (+) Simplest server output. No JS overhead.
- (+) SEO sees real content.
- (-) No interactivity. No live updates, no click handlers, no reload.
- (-) Mixing interactive and static widgets on the same page gets confusing — some respond to clicks, others don't.

### The spectrum

```
SPA          SSR HTML (A)     SSR HTML (B)     SSR HTML (C)     SSR Markdown
fully        island,          island with      static HTML,     fully
client       no prefetch      initial state    no hydration     server
```

Option B is the most capable but the most complex. Option A is what we have today. Option C is the simplest server path but removes the "islands" part of islands architecture.

A practical middle ground: default to A, let each widget **usage** opt into B with an `ssr` flag. The decision is per-instance, not per-definition — the same widget might need prefetch on a landing page but not on a dashboard.

In markdown:

````markdown
```widget:crypto-price ssr
{"coin": "bitcoin"}
```
````

In HTML:

```html
<widget-crypto-price data-params='{"coin":"bitcoin"}' ssr>
```

No `ssr` flag → client-only island (option A). With `ssr` → server prefetches data (option B). The widget definition stays unchanged — it just needs a `getData()` that works without browser APIs.

## Design questions

**Where does this logic live?**

On main, `composeWidgets` was in the app's dev server — it knew about widget manifests and could import widget modules. The router didn't know about widgets at all.

Options:

1. **In the renderer** — `SsrHtmlRouter` and `SsrMdRouter` receive a widget resolver and handle composition. The router becomes aware of widgets.
2. **In a composition layer** — A separate step between rendering and response. The renderer produces HTML/markdown with fenced widget blocks, and a compositor resolves them. The router stays widget-agnostic.
3. **In the dev server** — Like main. The dev server knows about widgets and composes them after rendering. Router stays simple.

**How do widgets get resolved server-side?**

Widget modules need to be importable on the server. This requires:

- A widget manifest mapping names to module paths
- Server-side dynamic import of widget modules (like `moduleLoaders` for routes)
- The widget's `getData()` must work without browser APIs

**What about widgets that need browser APIs in getData()?**

Some widgets might fetch from client-only APIs (localStorage, browser geolocation). For these, server-side `getData()` would fail. Options:

- Skip prefetch if `getData()` throws, fall back to client-side fetch
- Convention: `getData()` should work in both environments. Browser-only data fetching belongs in `connectedCallback` hooks, not `getData()`
- The `ssr` flag is per-usage, so widget authors don't need to declare anything — the page author who writes the fenced block or tag decides whether to request prefetch, knowing whether the widget's data is server-compatible

**Data serialization size**

`data-ssr` embeds the full data as a JSON attribute. For widgets with large datasets, this bloats the HTML. Possible mitigations:

- Widgets can implement a `getInitialData()` that returns a minimal subset for SSR
- Or accept that SSR HTML is slightly larger (the data would have been fetched as JSON anyway)

**Two entry points for widgets**

Widgets can appear in the output through two paths:

1. **Fenced blocks in markdown** — `` ```widget:name``` `` in `.page.md` files. The server-side markdown rendering pipeline (`expandMarkdown` → `processFencedWidgets`) converts these to `<widget-*>` elements. The server sees them during conversion and can intercept.

2. **Direct `<widget-*>` tags in HTML** — written by a `.page.ts` component in its `renderHTML()` output, or present in a `.page.html` template. These pass through the server untouched. The server pipeline never parses them.

In SPA mode, both work — `ComponentElement.register()` calls `customElements.define()`, so any `<widget-*>` in the DOM hydrates (Widget subclasses get the `widget-` prefix automatically). But for server-side prefetch (options B and C), the server needs to find all widgets regardless of entry point.

This means prefetch can't just hook into the fenced-block processing step. It needs to scan the final composed HTML for all `<widget-*>` elements:

```
1. Render route hierarchy (each component produces HTML)
2. Expand <mark-down> tags (fenced blocks → <widget-*> elements)
3. Inject child content into <router-slot> slots
4. Scan final HTML for all <widget-*> elements        ← prefetch point
5. For each with ssr: true, resolve module, call getData()
6. Inject data-ssr attribute (option B) or replace with rendered HTML (option C)
```

Step 4-6 is a post-processing pass on the fully composed HTML string. This is regex/string work — find `<widget-([a-z-]+)` tags, extract `data-params`, look up the widget, call `getData()` in parallel, inject results back.

This is simpler than trying to intercept at two different points in the pipeline. One pass, catches both entry points.

**Fenced blocks vs `<mark-down>` expansion**

With server-side markdown rendering, fenced widget blocks (`` ```widget:name``` ``) are already converted to `<widget-name data-params='...'>` elements by the time the HTML leaves the server. The prefetch step would need to happen during or after this expansion:

1. Render markdown to HTML (fenced blocks become `<pre><code>` blocks)
2. Process fenced blocks into `<widget-*>` elements
3. For each `<widget-*>` element, resolve the widget, call `getData()`, inject `data-ssr`

Or alternatively, process widget blocks before markdown rendering — extract them, resolve data in parallel, then substitute rendered content (for markdown) or annotated elements (for HTML).

Given the "two entry points" issue above, the post-processing approach (scan final HTML) subsumes this — fenced blocks are already `<widget-*>` elements by the time the scan runs.
