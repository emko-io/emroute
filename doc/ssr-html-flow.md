# SSR HTML Rendering Flow

```
 curl /html/about
       │
       ▼
┌─────────────────────────────────────────────┐
│  Server.handleRequest(req: Request)         │
│                                             │
│  url = new URL(req.url)                     │
│  pathname = "/html/about"                   │
│  routePath = pathname.slice(htmlBase.length) │
│           = "/about"                        │
│  routeUrl = new URL("/about" + search,      │
│                      url.origin)            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  SsrHtmlRouter.render(url: URL)             │
│  (inherited from SsrRenderer)               │
│                                             │
│  matched = core.match(url)                  │
│         ├─ not found → renderStatusPage(404)│
│         └─ redirect  → Response.redirect()  │
│                                             │
│  routeInfo = core.toRouteInfo(matched, url) │
│            = { url, params }                │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  RouteCore.match(url: URL)                  │
│                                             │
│  resolver.match(url.pathname)               │
│      │                                      │
│      ▼                                      │
│  RouteTrie.match("/about")                  │
│  → ResolvedRoute { node, pattern, params }  │
│  → toRouteConfig(resolved)                  │
│  → MatchedRoute { route, params }           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  SsrRenderer.renderPage(routeInfo, matched) │
│                                             │
│  hierarchy = buildRouteHierarchy("/about")  │
│            = ["/", "/about"]                │
│                                             │
│  for each pattern in hierarchy:             │
│    route = core.findRoute(pattern)          │
│    { content, title } =                     │
│        renderRouteContent(routeInfo, route) │
│    result = injectSlot(result, content,     │
│                        lastPattern)         │
│                                             │
│  result = stripSlots(result)                │
│  return { content, title }                  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  SsrHtmlRouter.renderRouteContent(ri,route) │
│                                             │
│  loadRouteContent(routeInfo, route, isLeaf) │
│    │                                        │
│    ├─ core.loadModule(files.ts) → component │
│    ├─ core.buildComponentContext(ri, route)  │
│    │    ├─ readFile(html, md, css)           │
│    │    └─ { ...ri, pathname, searchParams,  │
│    │         files, signal, isLeaf }         │
│    │    └─ contextProvider(base) if set      │
│    │                                        │
│    ├─ component.getData({ params, context })│
│    └─ component.renderHTML({ data, params,  │
│                              context })     │
│                                             │
│  expandMarkdown(content)                    │
│  attributeSlots(content, route.pattern)     │
│  resolveWidgetTags(content, widgets, ri)    │
│                                             │
│  return { content, title }                  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Server (continued)                         │
│                                             │
│  result = { content, status, title }        │
│  html = injectSsrContent(shell,            │
│           result.content, title, pathname)  │
│  return new Response(html, { status })      │
└─────────────────────────────────────────────┘
```

## SSR MD Divergence

Everything above `renderRouteContent` is shared — the abstract `SsrRenderer`
base class owns the pipeline. SSR MD only diverges in format-specific overrides:

| Step               | SSR HTML                                | SSR MD                                       |
|--------------------|-----------------------------------------|----------------------------------------------|
| `renderContent()`  | `component.renderHTML()`                | `component.renderMarkdown()`                 |
| Post-processing    | `expandMarkdown()` → `attributeSlots()` → `resolveWidgetTags()` | attribute bare `` ```router-slot``` `` → `resolveWidgets()` (fenced blocks) |
| `injectSlot()`     | regex replace `<router-slot pattern="...">` | string replace `` ```router-slot {"pattern":"..."}``` `` |
| `stripSlots()`     | remove `<router-slot...></router-slot>` | remove `` ```router-slot...``` `` blocks     |
| `renderRedirect()` | `<meta http-equiv="refresh">`           | `Redirect to: /path`                         |
| `renderStatusPage()` | `<h1>` + `<p>` HTML                  | `# Heading` + `` `path` `` markdown          |
| Server response    | inject into HTML shell, `text/html`     | return raw content, `text/markdown`           |

## SPA HTML Router Flow

Two entry points: initial load (SSR adoption) and client-side navigation.

### Initial Load (SSR Adoption)

```
 Browser loads /html/about
       │
       ├─── Server returns SSR HTML with
       │    data-ssr-route="/html/about"
       │    + <script src="app.js">
       │
       ▼
┌─────────────────────────────────────────────┐
│  createSpaHtmlRouter(resolver, options)      │
│                                             │
│  router = new SpaHtmlRouter(resolver, opts) │
│  router.initialize()                        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  initialize()                               │
│                                             │
│  slot = document.querySelector('router-slot')│
│  Navigation API check                       │
│  abortController = new AbortController()    │
│                                             │
│  navigation.addEventListener('navigate',    │
│    event → handleNavigation())              │
│                                             │
│  ssrRoute = slot.data-ssr-route             │
│  ├─ match? → adopt SSR content (skip render)│
│  └─ no match → handleNavigation(location)   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  SSR Adoption (route matches)               │
│                                             │
│  stripBase("/html/about") = "/about"        │
│  matched = core.match(url)                  │
│  core.currentRoute = matched                │
│  navigation.updateCurrentEntry({ state })   │
│  remove data-ssr-route                      │
│  DONE — no render needed                    │
└─────────────────────────────────────────────┘
```

### Client-Side Navigation

```
 User clicks <a href="/html/blog">
       │
       ▼
┌─────────────────────────────────────────────┐
│  Navigation API 'navigate' event            │
│                                             │
│  canIntercept? hashChange? download?        │
│  url = new URL(event.destination.url)       │
│  /md/* paths → pass through (full reload)   │
│                                             │
│  event.intercept({                          │
│    scroll: 'manual',                        │
│    handler: handleNavigation(               │
│      url.pathname + search + hash,          │
│      event.signal)                          │
│  })                                         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  handleNavigation(url, signal)              │
│                                             │
│  urlObj = new URL(url, location.origin)     │
│  pathname = urlObj.pathname                 │
│  routePath = stripBase(pathname)            │
│            = "/blog"                        │
│  routeUrl = new URL(routePath + search      │
│                     + hash, origin)         │
│                                             │
│  matched = core.match(routeUrl)             │
│         ├─ not found → renderStatusPage(404)│
│         └─ redirect  → navigation.navigate()│
│                                             │
│  core.currentRoute = matched                │
│  routeInfo = core.toRouteInfo(matched,      │
│                               routeUrl)     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  View Transition (if supported)             │
│                                             │
│  document.startViewTransition(async () => { │
│    renderPage(routeInfo, matched, signal)   │
│  })                                         │
│  signal → skipTransition() on abort         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  BaseRenderer.renderPage(ri, matched, sig)  │
│                                             │
│  hierarchy = buildRouteHierarchy(pattern)   │
│            = ["/", "/blog"]                 │
│                                             │
│  currentSlot = this.slot (router-slot)      │
│                                             │
│  for each pattern in hierarchy:             │
│    route = core.findRoute(pattern)          │
│    { html, title } =                        │
│        renderRouteContent(ri, route, signal)│
│                                             │
│    currentSlot.setHTMLUnsafe(html)    ← DOM │
│                                             │
│    wait for <mark-down> render if present   │
│    attribute bare <router-slot> tags        │
│                                             │
│    if not leaf:                             │
│      currentSlot = querySelector(           │
│        'router-slot[pattern="..."]')        │
│                                             │
│  updateTitle(pageTitle)                     │
│  emit('load')                               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  renderRouteContent(ri, route, signal)      │
│                                             │
│  core.loadModule(files.ts) → component      │
│  core.buildComponentContext(ri, route, sig)  │
│    ├─ fetch(html, md, css) via fileReader   │
│    └─ contextProvider(base) if set          │
│                                             │
│  component.getData({ params, signal, ctx }) │
│  component.renderHTML({ data, params, ctx })│
│  component.getTitle({ data, params, ctx })  │
│                                             │
│  return { html, title }                     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Back in handleNavigation                   │
│                                             │
│  event.scroll() — Navigation API restores   │
│  emit('navigate', { pathname, params })     │
└─────────────────────────────────────────────┘
```

## Hash Router Flow

Lightweight client-side router for leaf-mode mini-apps. Routes defined
inline by the consumer, not from the manifest. Coexists with the SPA
router (which skips `hashChange` events).

```
 Consumer defines inline routes:
 createHashRouter({
   routes: [
     { pattern: '/settings', loader: () => import('./settings.ts') },
     { pattern: '/users/:id', loader: () => import('./users.ts') },
   ],
   slot: 'hash-slot',
 })
       │
       ▼
┌─────────────────────────────────────────────┐
│  createHashRouter(options)                   │
│                                             │
│  buildRouteTree(options.routes)             │
│    ├─ builds RouteNode tree from patterns   │
│    ├─ moduleLoaders[pattern] = loader       │
│    └─ resolver = new RouteTrie(tree)        │
│                                             │
│  router = new HashRouter(resolver, {        │
│    moduleLoaders, extendContext })           │
│  router.initialize(slot)                    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  initialize(slot)                           │
│                                             │
│  this.slot = querySelector('hash-slot')     │
│  addEventListener('hashchange', handler)    │
│                                             │
│  if location.hash exists:                   │
│    handleHashChange()  ← initial render     │
└──────────────────┬──────────────────────────┘
                   │
                   │
 User clicks <a href="#/users/42">
       │
       ▼
┌─────────────────────────────────────────────┐
│  hashchange event                           │
│                                             │
│  handleHashChange()                         │
│  path = location.hash.slice(1)              │
│       = "/users/42"                         │
│  matchUrl = new URL(path, location.origin)  │
│  controller = new AbortController()         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  core.match(matchUrl)                       │
│                                             │
│  RouteTrie.match("/users/42")               │
│  → { route, params: { id: "42" } }         │
│                                             │
│  ├─ not found → slot.setHTMLUnsafe(404)     │
│  └─ matched:                                │
│     core.currentRoute = matched             │
│     routeInfo = core.toRouteInfo(matched)   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  BaseRenderer.renderPage(ri, matched, sig)  │
│  (shared with SPA HTML router)              │
│                                             │
│  hierarchy = buildRouteHierarchy("/users/:id")
│            = ["/", "/users/:id"]            │
│                                             │
│  for each pattern:                          │
│    route = core.findRoute(pattern)          │
│    { html, title } =                        │
│        renderRouteContent(ri, route, signal)│
│                                             │
│    currentSlot.setHTMLUnsafe(html)    ← DOM │
│    wait for <mark-down> if present          │
│    attribute bare <router-slot> tags        │
│    descend into nested slot if not leaf     │
│                                             │
│  updateTitle(pageTitle)                     │
│  emit('load')                               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  renderRouteContent(ri, route, signal)      │
│                                             │
│  core.loadModule(pattern)                   │
│    → moduleLoaders[pattern]()               │
│    → consumer's loader() runs               │
│    → import('./users.ts') → component       │
│                                             │
│  core.buildComponentContext(ri, route, sig)  │
│  component.getData({ params, signal, ctx }) │
│  component.renderHTML({ data, params, ctx })│
│  component.getTitle(...)                    │
│                                             │
│  return { html, title }                     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Back in handleHashChange                   │
│                                             │
│  emit('navigate', { pathname, params })     │
└─────────────────────────────────────────────┘
```

### Hash Router vs SPA HTML Router

| Aspect              | SPA HTML                         | Hash                              |
|---------------------|----------------------------------|-----------------------------------|
| Navigation event    | Navigation API `navigate`        | `hashchange`                      |
| URL shape           | `/html/about`                    | `#/settings`                      |
| BasePath stripping  | Yes (`stripBase`)                | No — hash is self-contained       |
| SSR adoption        | Yes (`data-ssr-route`)           | No — hash content never SSR'd     |
| View transitions    | `document.startViewTransition()` | Not wired up                      |
| Route source        | Manifest (route tree)            | Inline consumer definitions       |
| Slot element        | `<router-slot>`                  | `<hash-slot>`                     |
| Coexistence         | Skips hash changes               | Ignores non-hash navigation       |

## URLPattern vs RouteTrie

These are orthogonal to the Navigation API — URLPattern handles *matching*,
Navigation API handles *interception*.

**URLPattern** (replaced):
- Flat array, one per route. Match = iterate all: O(n).
- No hierarchy — parent/child inferred from pattern strings at render time.
- Error boundaries, status pages required separate lookup structures.
- Browser support gaps (no Firefox, no Safari without polyfill).
- We only ever used pathname `:param` and `*` — never regex, protocol,
  hostname, search, or hash matching. `URLPatternResult` was dead code
  (removed this session).

**RouteTrie** (current):
- Tree mirrors filesystem. Match = walk segments: O(depth).
- Hierarchy is inherent — parent nodes exist in the tree.
- Error boundaries, status pages, redirects all live on nodes.
- JSON-serializable — write to disk, send over wire, hydrate on client.
- Works everywhere — no browser API dependency.

URLPattern adds nothing the trie doesn't already handle. The trie also
produces the same `RouteNode` shape everywhere — SSR, SPA, and hash router
all use `RouteTrie` with identical matching logic.

## Navigation API vs hashchange

**Navigation API** (SPA HTML router):
- Single handler for all navigations: link clicks, back/forward,
  `navigate()` calls, form submissions.
- Provides `event.signal` for abort, `event.intercept()` for SPA routing,
  `event.scroll()` for scroll restoration.
- Explicitly skips hash changes (`event.hashChange === true`).

**hashchange** (Hash router):
- Fires when `location.hash` changes. The correct API for hash-based routing.
- Works in every browser, inside iframes, inside embedded widgets.
- Navigation API cannot intercept hash routing — it treats hash changes as
  same-document anchor scrolling, not client-side navigation.

If Navigation API is available, use the SPA HTML router. Hash router exists
for cases where you explicitly don't want full-page navigation control:
`leaf` mode mini-apps, embedded widgets, iframe-constrained contexts.
