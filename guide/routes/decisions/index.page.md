<!--==chunk:hero==-->

# Design Decisions

emroute is built on a single conviction: **the platform is the framework**.
Where other routers wrap browser primitives in abstractions — VDOM, hooks,
signals, JSX — emroute leans directly on URLPattern, Custom Elements, the
Navigation API, `setHTMLUnsafe`, `adoptedStyleSheets`, `@scope`, `@layer`.

The filesystem is the route config. Content is the page. One component
serves browsers, LLMs, and curl. Concerns the router doesn't own — caching,
optional params, script execution, CSS encapsulation — are pushed back to
where they belong. When abstraction is unavoidable, it picks one rather
than two. The result is a framework whose "magic" is just standards a
developer can recognize.

<!--==chunk:card==-->

## ADR-0001 · No optional params

Reject `[id?]`. Use `<router-slot>` with default content in the parent
route instead. A "missing" param has an implicit default that leaks
routing into components.

[Read →](decisions/no-optional-params)

<!--==chunk:card==-->

## ADR-0002 · Wildcards via directory index

A flat file matches exactly. A directory index becomes a catch-all. Reuse
the existing flat-vs-directory distinction rather than inventing
`[...rest]`.

[Read →](decisions/wildcard-routes)

<!--==chunk:card==-->

## ADR-0003 · Triple rendering

Every route renders three ways from one component — `/app/`, `/html/`,
`/md/`. Browsers, LLMs, and CLIs each get the format they want, with no
duplication.

[Read →](decisions/triple-rendering)

<!--==chunk:card==-->

## ADR-0004 · File-based routing

Routes are defined by filesystem convention. `[id]` → `:id`, directory
structure → hierarchy, `.ts` > `.html` > `.md` precedence. Adding a route
means adding a file.

[Read →](decisions/file-based-routing)

<!--==chunk:card==-->

## ADR-0005 · Unified component model

`Widget extends Component`. One class hierarchy, one custom element
implementation, one rendering pipeline. The only difference is audience
and tag prefix.

[Read →](decisions/unified-component-widget)

<!--==chunk:card==-->

## ADR-0006 · Native APIs, zero deps

URLPattern, Custom Elements, Navigation API, `fetch`, AbortController,
template literals. No VDOM, no JSX, no framework. Works in Deno, Node,
Bun, any browser.

[Read →](decisions/zero-dependencies)

<!--==chunk:card==-->

## ADR-0007 · Content-first pages

A page can be just `.page.md` with no JS. The default component provides
a fallback chain so static content needs zero code. Escalate to `.page.ts`
when you need logic.

[Read →](decisions/content-first-pages)

<!--==chunk:card==-->

## ADR-0008 · No data caching

The router does not cache `getData()` results. Caching is a state-management
concern, not a routing concern — components own their data lifecycle.

[Read →](decisions/no-data-caching)

<!--==chunk:card==-->

## ADR-0009 · No inline `<script>`

Don't auto-activate `<script>` tags injected via `innerHTML`. Per spec they
don't run, and widgets already provide a clean activation path.

[Read →](decisions/no-inline-scripts)

<!--==chunk:card==-->

## ADR-0010 · Raw attributes for params

Widget params are plain HTML attributes (`<widget-counter start="0">`),
kebab→camelCase, each value `JSON.parse`'d with string fallback. Not
verbose `data-params='{...}'`.

[Read →](decisions/raw-attributes)

<!--==chunk:card==-->

## ADR-0011 · Light DOM + SSR widgets

Components render into light DOM. SSR resolves widgets server-side by
calling their `getData()` + render methods. `/md/` routes get fully-rendered
widgets with zero JS.

[Read →](decisions/light-dom-ssr)

<!--==chunk:card==-->

## ADR-0012 · Keep it simple

Drop the `SpaMode` enum from the router. Server behavior, bundling, and
routing scope are orthogonal concerns. Conventions over configuration:
the filesystem determines the archetype.

[Read →](decisions/keep-it-simple)

<!--==chunk:card==-->

## ADR-0013 · Invoker Commands API

Two entry points for one overlay system: declarative `commandfor`/`command`
plus `popover`/`<dialog>` (zero JS), and a programmatic `OverlayService`
for dynamic cases.

[Read →](decisions/invoker-commands)

<!--==chunk:card==-->

## ADR-0014 · Navigation API only

Use the Navigation API exclusively. One `navigate` event replaces ~50 lines
of click interception, composedPath traversal, and `popstate` handling.

[Read →](decisions/navigation-api)

<!--==chunk:card==-->

## ADR-0015 · `setHTMLUnsafe`

Replace `innerHTML` with `setHTMLUnsafe()` for SPA slot content and widget
shadow roots. Parses Declarative Shadow DOM templates and accepts
`TrustedHTML` for future CSP.

[Read →](decisions/set-html-unsafe)

<!--==chunk:card==-->

## ADR-0016 · No Houdini

Reject CSS Houdini APIs. The production-ready ones don't fix emroute's
real CSS pain points; the useful ones are Chromium-only. Lean on
`@scope`, `@layer`, `:defined` instead.

[Read →](decisions/no-houdini)

<!--==chunk:card==-->

## ADR-0017 · Bun + npm

Publish to npm, target Bun as primary runtime. JSR's design (publish-time
graph freezing, no peer deps) is structurally incompatible with what a
framework needs.

[Read →](decisions/bun-ecosystem)

<!--==chunk:card==-->

## ADR-0018 · Private widgets replace elements

Developer-only components live in `widgets/` with `private: true`, hidden
from CMS enumeration but sharing the full widget pipeline. `elements/`
shrinks to plain `HTMLElement` escape hatch.

[Read →](decisions/private-widgets)

<!--==chunk:card==-->

## ADR-0019 · adoptedStyleSheets for widgets

Use `adoptedStyleSheets` for widget CSS, wrapped in `@layer emroute`.
Stylesheets survive `setHTMLUnsafe()` re-renders; one sheet object serves
N widget instances.

[Read →](decisions/adopted-stylesheets)

<!--==chunk:card==-->

## ADR-0020 · Browser API adoption

Living document tracking newer browser APIs to adopt selectively —
container queries (shipped in 1.11.0), `:has()`, `AbortSignal.timeout()`,
`CloseWatcher`, CSS anchor positioning.

[Read →](decisions/browser-api-adoption)

<!--==chunk:outro==-->

Each decision links to its full record. The originals live in
[`doc/architecture/`](https://github.com/emko-io/emroute/tree/main/doc/architecture)
on GitHub.
