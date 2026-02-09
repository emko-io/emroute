SSR HTML + SPA script causes double rendering

The SSR HTML shell includes the SPA script, which boots the router. The router
re-renders the entire route tree into the page, duplicating what the server
already rendered.

With the selected approach for #22 (reuse index.html as SSR shell), the SPA
script will always load — it's needed for island hydration and client-side
navigation. So removing the script isn't an option.

## Confirmed

Reproduced in test/browser/hydration.test.ts. The test proves:

1. SSR HTML response at /html/hydration contains pre-rendered content with
   getData called once (server-side)
2. When opened in a browser, the SPA router calls handleNavigation() on init,
   which re-renders the page — calling getData() again and replacing innerHTML
3. The timestamps differ between SSR and SPA output, proving the DOM was rebuilt

## Hydration design (three levels)

### 1. Route-level hydration (SPA router)

SPA router must detect that <router-slot> already has SSR content and skip
the initial handleNavigation(). Detection via self-contained attributes:

```html
<router-slot data-ssr-route="/hydration" data-ssr-data='{"callCount":1}'>
  ...pre-rendered content...
</router-slot>
```

On initialize():
- Check for data-ssr-route on the slot element
- Verify it matches current location.pathname (strip /html/ prefix)
- If match: skip handleNavigation(), set internal state (currentRoute, params)
  from attributes, wire up event listeners only
- Remove data-ssr-route after adoption (subsequent navigations render normally)
- If no match or no attribute: full client-side render (current behavior)

### 2. Component/Widget-level hydration (ComponentElement)

Widgets rendered server-side carry their data as data-ssr attribute:

```html
<widget-crypto-price coin="bitcoin" data-ssr='{"price":42000}'>
  <span>$42,000</span>
</widget-crypto-price>
```

ComponentElement.connectedCallback() already checks for data-ssr and skips
getData() when present. But it still calls this.render() which rebuilds
innerHTML unnecessarily. Fix: when data-ssr is present, skip BOTH getData()
and render() — the DOM is already correct from SSR. Just set state to ready
and signal completion.

The component is "adopted" — its internal state is hydrated from data-ssr,
and it's ready for future interactions (reload(), user events, re-fetch).

This is lighter than React hydration because there's no virtual DOM to
reconcile. We just: skip render (DOM correct), restore state (from serialized
data), attach behavior (custom element is now live).

### 3. Server-side widget rendering (SSR must render widgets)

Currently NEITHER SSR renderer actually renders widgets:

SSR HTML renderer:
- processFencedWidgets() converts fenced blocks to <widget-*> HTML elements
  but never calls getData() or renderHTML(). Widgets are empty shells waiting
  for client-side JS.

SSR Markdown renderer:
- Does not process fenced widget blocks at all. A .page.md with widgets
  outputs the raw fenced block syntax to LLMs/text clients, which is useless.

This is critical for /md/ routes which have ZERO client-side JS — widgets
must be fully rendered server-side. The markdown response is final output.

Required: a server-side widget registry so SSR renderers can look up widget
instances, call getData(), and render them:
- SSR HTML: call getData() + renderHTML(), inject data-ssr attribute with
  the data for client-side adoption
- SSR Markdown: call getData() + renderMarkdown(), replace fenced block
  with rendered text output

### Self-contained attributes over <script> blocks

Hydration metadata uses attributes on the elements themselves rather than
<script type="application/json"> blocks. Reasons:
- Self-contained: data travels with the element
- Works in markdown context (no <script> tags)
- Inspectable in DevTools
- No orphaned metadata if elements are moved/removed

### Two component modes

ComponentElement has two modes depending on how the user arrived:

1. Hydrate from SSR: data-ssr present → skip getData + render, adopt DOM
2. Render from scratch: no data-ssr → full getData + render (SPA navigation,
   pure SPA at /, dynamically added components)

Both paths coexist. Initial load from /html/* uses mode 1. Subsequent SPA
navigation or pure SPA loads use mode 2.

## Architectural decision

See ADR-0011: Light DOM with Server-Side Widget Rendering. Shadow DOM rejected.
SSR replaces widgets with rendered output. CSS scoped by convention via tag names.

## Implementation order

1. Server-side widget registry (enables SSR renderers to render widgets)
2. SSR HTML widget rendering with data-ssr injection
3. SSR Markdown widget rendering (highest impact — /md/ routes are broken
   for widgets today)
4. ComponentElement hydration fix (skip render when data-ssr present)
5. SSR HTML shell injects data-ssr-route on <router-slot>
6. Route-level hydration (SPA router skips initial render on SSR pages)
7. Dev server discovers widget files and passes registry to SSR routers

## Test fixture

test/browser/fixtures/routes/hydration.page.ts — tracks getData() call count
and timestamps. test/browser/hydration.test.ts confirms the double render bug.
