# Router Comparison: emroute vs. The Field

## Overview

|                  | **emroute**                          | **wouter**              | **preact-iso**           | **@lit-labs/router**        | **@solidjs/router**     |
| ---------------- | ------------------------------------ | ----------------------- | ------------------------ | --------------------------- | ----------------------- |
| **Framework**    | Framework-agnostic (Web Components)  | React / Preact          | Preact                   | Lit                         | Solid.js                |
| **Maturity**     | In development                       | Stable (v3.9)           | Stable (v2.11)           | Experimental (v0.1.4)       | Production (v0.15)      |
| **Philosophy**   | File-based, multi-context, zero deps | Minimalist, hooks-first | Isomorphic async toolkit | Reactive Controller pattern | Full-featured, reactive |
| **Bundle**       | 0 (native APIs)                      | ~2.1 KB gz              | ~1.5-2.5 KB gz           | ~81 KB unpacked             | ~192 KB unpacked        |
| **Dependencies** | None                                 | regexparam, mitt        | preact (peer)            | lit                         | solid-js (peer)         |

---

## Architecture Comparison

**emroute** stands out with its **file-based, multi-renderer architecture**.
Routes are derived from the filesystem (`about.page.ts` -> `/about`), and the same
route/component renders in three contexts: SPA (browser), SSR HTML (server), and SSR
Markdown (for LLMs/text clients). It uses native Web Components (`<router-slot>`,
`<mark-down>`, `<widget-*>`) and no framework runtime.

**wouter** is the opposite extreme -- a ~2 KB hooks library where `<Router>` is
optional. No opinions on rendering, data, or SSR beyond a `ssrPath` prop. Maximum
flexibility, minimum features.

**preact-iso** occupies a middle ground -- small but opinionated about isomorphic
rendering. Its Router _is_ the Suspense boundary, enabling seamless async transitions
with no loading flicker.

**@lit-labs/router** uniquely uses the Reactive Controller pattern (not components).
Routes are configured as plain objects attached to host elements. Elegant but
experimental and missing major features.

**@solidjs/router** is the most feature-complete -- React Router-level capabilities
plus Solid's fine-grained reactivity, an integrated data layer
(`query`/`action`/`revalidate`), and progressive enhancement via forms.

---

## Feature Comparison Table

| Feature                  | emroute                          | wouter                         | preact-iso                    | @lit-labs/router          | @solidjs/router                       |
| ------------------------ | -------------------------------- | ------------------------------ | ----------------------------- | ------------------------- | ------------------------------------- |
| **Route definition**     | File-based convention            | JSX / hooks                    | JSX children                  | Config objects            | JSX / config array                    |
| **Pattern matching**     | URLPattern API                   | regexparam                     | Custom parser                 | URLPattern API            | Custom matcher                        |
| **Dynamic params**       | `[id]` in filename               | `:id`                          | `:id`                         | `:id` (URLPattern)        | `:id`                                 |
| **Optional params**      | --                               | `:id?`                         | `:id?`                        | URLPattern syntax         | `:id?`                                |
| **Wildcards**            | Directory index convention       | `/*`, `/*?`                    | `*`, `:path+`, `:path*`       | `/*`                      | `*`, `*name`                          |
| **Nested routes**        | Hierarchy from file tree         | `nest` prop                    | `/*` + nested Router          | `/*` tail propagation     | JSX nesting / `children`              |
| **Match filters**        | --                               | Custom parser plug             | --                            | --                        | Enum, regex, function                 |
| **Navigation**           | History API                      | History / Hash / Memory        | History only                  | History only              | History / Hash / Memory               |
| **Programmatic nav**     | `router.navigate()`              | `setLocation()` / `navigate()` | `route()` via hook            | `goto()`                  | `useNavigate()`                       |
| **Link component**       | Native `<a>` intercepted         | `<Link>`                       | Native `<a>` intercepted      | Native `<a>` intercepted  | `<A>` with active classes             |
| **Active link styling**  | --                               | `className` fn                 | --                            | --                        | `activeClass` / `inactiveClass`       |
| **SSR**                  | Full (HTML + Markdown)           | `ssrPath` prop                 | `prerender()` + `hydrate()`   | None                      | Full (streaming + hydration)          |
| **Markdown SSR**         | First-class (`/md/*`)            | --                             | --                            | --                        | --                                    |
| **Lazy loading**         | Module loaders in manifest       | `React.lazy` (manual)          | `lazy()` with `.preload()`    | `enter()` callback        | `solid-js/lazy()`                     |
| **Data fetching**        | `getData()` on Component         | --                             | --                            | --                        | `query()`, `createAsync()`, preload   |
| **Data prefetch (SSR)**  | `data-ssr` attribute on widgets  | --                             | Suspense during prerender     | --                        | Preload fns + query cache             |
| **Actions / mutations**  | --                               | --                             | --                            | --                        | `action()`, form integration          |
| **Route guards**         | Error boundaries                 | Manual (wrapper components)    | Manual                        | `enter()` returns false   | `useBeforeLeave()`, redirect in query |
| **Error boundaries**     | Pattern-prefix `.error.ts`       | --                             | `<ErrorBoundary>`             | Throws on no match        | Solid's `<ErrorBoundary>`             |
| **Status pages**         | `404.page.ts`, `401`, `403`      | Pathless `<Route>` as 404      | `default` prop                | Fallback config           | `*404` catch-all                      |
| **Redirects**            | `.redirect.ts` files             | `<Redirect>` component         | Manual via `route()`          | --                        | `<Navigate>`, `redirect()`            |
| **Base path**            | `/html/`, `/md/` prefixes        | `base` prop (stacking)         | `scope` prop (filtering only) | --                        | `base` prop                           |
| **Scroll restoration**   | `scrollY` in state, anchor nav   | --                             | Scroll to top on push         | --                        | `noScroll` option                     |
| **Hash routing**         | --                               | `useHashLocation`              | --                            | --                        | `<HashRouter>`                        |
| **Memory routing**       | --                               | `memoryLocation`               | --                            | --                        | `<MemoryRouter>`                      |
| **Type safety**          | Full generics (`Component<C,D>`) | Auto-inferred from path        | Conditional type extraction   | Generic params object     | Typed actions/queries                 |
| **Custom elements**      | Core architecture                | --                             | --                            | Works with (Lit elements) | --                                    |
| **Islands architecture** | Built-in (pages + widgets)       | --                             | --                            | --                        | --                                    |
| **Multi-format output**  | HTML + Markdown from same code   | HTML only                      | HTML only                     | HTML only                 | HTML only                             |
| **Widget system**        | Fenced blocks, custom elements   | --                             | --                            | --                        | --                                    |

---

## What emroute Does That Nobody Else Does

1. **Triple rendering context** -- The same `PageComponent` produces browser HTML
   (SPA), server HTML (SSR), and Markdown (for LLMs/CLI). No other router even
   acknowledges Markdown as a rendering target.

2. **File-based routing without a build framework** -- Routes come from the filesystem
   (`about.page.ts`, `projects/[id].page.ts`) like Next.js or SvelteKit, but without
   requiring their framework. wouter, preact-iso, Lit router, and Solid router all
   require explicit route declarations.

3. **Content-first pages** -- A page can be _just_ a `.page.md` or `.page.html` file
   with no JavaScript. The `DefaultPageComponent` renders it automatically. Other
   routers require a component for every route.

4. **Islands architecture with widgets** -- Fenced code blocks in Markdown
   (`` ```widget:name `` ``) become interactive `<widget-*>` custom elements with
   server-prefetched data. This blends static content with dynamic islands without a
   framework like Astro.

5. **Hierarchical route rendering** -- Parent -> child routes render in sequence with
   `<router-slot>` nesting, all as string concatenation (no DOM needed for SSR). The
   hierarchy is built from the file tree, not configuration.

6. **Markdown fenced block syntax** -- `` ```router-slot``` `` and
   `` ```widget:name``` `` in Markdown files are first-class routing/component
   primitives.

---

## Where emroute Differs

Some "gaps" are deliberate design decisions, not missing features.

| Feature                   | Others                                                           | emroute position                              |
| ------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Hash routing              | wouter, @solidjs/router                                          | Useful for electron apps, legacy browsers     |
| Memory routing            | wouter, @solidjs/router                                          | Important for testing                         |
| Route guards / middleware | @solidjs/router (`useBeforeLeave`), @lit-labs/router (`enter()`) | emroute relies on error boundaries            |
| Data mutations / actions  | @solidjs/router (`action()`, forms)                              | emroute is read-only (getData)                |
| Match filters             | @solidjs/router                                                  | Runtime param validation                      |
| Active link styling       | wouter, @solidjs/router                                          | CSS class toggling on current route links     |
| Optional params           | wouter, preact-iso, @solidjs/router                              | Not planned — slot default content (ADR-0001) |
| Wildcards                 | wouter, preact-iso, @solidjs/router                              | Directory index convention (ADR-0002)         |
| Eager preload on hover    | @solidjs/router, preact-iso (`lazy().preload()`)                 | Speculative prefetching                       |
| Progressive hydration     | preact-iso                                                       | Deferred hydration of lazy routes             |

---

## Feature Parity

| Feature                   | emroute                             | Closest peer                                                                |
| ------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| URLPattern-based matching | Yes                                 | @lit-labs/router (same standard)                                            |
| Component data loading    | `getData()` on PageComponent        | @solidjs/router `query()` (more powerful)                                   |
| SSR data prefetch         | `data-ssr` attribute injection      | @solidjs/router (serialized cache transfer)                                 |
| Error boundaries by path  | `.error.ts` pattern-prefix matching | Unique -- others use component-tree boundaries                              |
| `<router-slot>` nesting   | Custom element                      | Conceptually like `<Outlet>` in Solid/React Router (we use `<router-slot>`) |
| Module caching            | Built-in                            | -- (frameworks handle this via bundler)                                     |
| Scroll restoration        | `scrollY` in state                  | @solidjs/router (`noScroll`), preact-iso (auto scroll-to-top)               |

---

## Design Philosophy Spectrum

```
Minimal <------------------------------------------------------> Full-featured
  wouter    preact-iso    @lit-labs/router    emroute    @solidjs/router
  (~2 KB)    (~2 KB)        (labs)           (file-based)       (data layer)
```

- **wouter** and **preact-iso** are deliberately small and defer to their framework
  for everything beyond URL -> component mapping.
- **@lit-labs/router** is small but aspires to more -- URLPattern, nested routes,
  guards -- but is unfinished.
- **emroute** is unique in scope: it's not just a router but a _page rendering
  framework_ with file-based routing, multi-format output, and an islands
  architecture.
- **@solidjs/router** is the most complete, with an integrated data layer
  (query/cache/action/revalidation) that rivals React Router v7 and TanStack Router.
