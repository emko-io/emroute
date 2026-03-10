# bootEmrouteApp loads all widgets eagerly and duplicates requests

## Problem

A single page load (`/html/path/create`) generates ~55 HTTP requests. Three
categories of waste:

### 1. All widget modules loaded eagerly

`bootEmrouteApp()` calls `ComponentElement.registerLazy()` for every widget in
the manifest. On an SSR-hydrated page, `connectedCallback` fires immediately
for widgets in the DOM, which triggers the lazy loader. But **all** widgets are
loaded — not just those present on the page.

Observed: `course-graph`, `course-list`, `create-course-form`, `login-form`,
`step-nav` all fetched despite not being in the DOM.

### 2. Widget JS fetched twice for SSR-hydrated widgets

Widgets that are on the page (e.g., `nav.widget.js`, `search.widget.js`,
`create-path-form.widget.js`) are fetched once directly from the initial HTML
and then fetched again through the lazy loader's blob URL mechanism.

### 3. Manifests fetched twice

`routes.manifest.json` and `widgets.manifest.json` are each fetched twice —
once during SSR hydration and once during `bootEmrouteApp()`.

## Observed request breakdown

```
Initial page + assets:     ~13 requests (html, css, js, emkoma chunks)
Manifests (1st fetch):       3 requests (routes, widgets, elements[404])
Visible widget modules:      5 requests (nav, search, create, user-profile, create-path-form)
Manifests (2nd fetch):       2 requests (duplicate routes, widgets)
ALL widget modules + blobs: ~30 requests (every widget re-fetched + blob URLs)
Tail:                         3 requests (index.html[404], main.css, importmap.json)
```

## Expected behavior

- Only widget modules present on the current page should be loaded
- SSR-hydrated widgets should not be re-fetched by the lazy loader
- Manifests should be fetched once and cached

## Possible approaches

1. **Defer lazy loading to `connectedCallback`** — `registerLazy` already does
   this, but something triggers all widget modules to load regardless of DOM
   presence. Investigate what causes the eager fetch for off-page widgets.

2. **Skip re-fetch for SSR-hydrated widgets** — if a widget element has the
   `ssr` attribute when `connectedCallback` fires, the module was already
   loaded. Skip the lazy loader fetch.

3. **Cache manifest responses** — store the first manifest fetch result and
   reuse it for subsequent requests within the same page load.

## Impact

High — request count scales with total widget count, not page complexity. A
project with 20 widgets would make 40+ unnecessary requests on every page load.

## Resolution

Resolved in 1.8.2-beta.2 (`5d9a3c4`).

`Emroute.create()` no longer eagerly imports all widget modules at startup.
`WidgetRegistry.addLazy()` stores name + module path; `SsrRenderer.resolveWidget()`
loads via Pipeline → Runtime on first encounter during rendering. Only widgets
present on the current page are loaded.

Items #2 (double fetch) and #3 (manifest duplication) are Runtime caching
concerns — the framework no longer makes redundant calls from its own code.
Deduplication of `loadModule()` / `runtime.query()` is the Runtime provider's
responsibility.
