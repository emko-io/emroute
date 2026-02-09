CSS strategy — no styling story exists

emroute has no CSS solution. Components render raw HTML with no styling, and
there's no convention for associating styles with routes or components.

Ideas:

1. .page.css file convention — alongside .page.ts/.page.html/.page.md, a
   .page.css file would hold route-specific styles. Components could import it
   individually (better DX — .css files get syntax highlighting in editors).
   The route generator could scan routes/ and bundle all .page.css files into
   a single stylesheet, similar to how it generates routes.manifest.ts.

2. Component-level CSS — each component imports its own .css file. Could be
   co-located (project.page.css next to project.page.ts) or in a styles/
   directory.

3. Shadow DOM scoping — if components move to Shadow DOM (#21), styles become
   naturally scoped per component. But global theming gets harder.

4. No opinion — stay unstyled and let consumers bring their own CSS framework.
   Document how to integrate with Tailwind, vanilla CSS, etc.

CSS container queries:

- Widgets are self-contained and render at varying sizes depending on where
  they're embedded (sidebar, full-width, inside a card, etc.). Container
  queries let a widget respond to its own container's width rather than the
  viewport. This is a much better fit than media queries for component-based
  architecture.
- Guide/docs should recommend container queries as the default responsive
  pattern for widgets, and explain the difference from media queries. Many
  developers don't know container queries exist.
- Example: a widget that shows a compact layout in a sidebar but expands to a
  table in a full-width section — all without knowing where it's placed.

Open questions:

- Should the framework bundle CSS or leave that to the consumer's build tool?
- How does route-level CSS interact with nested routes? (parent + child styles)
- Should .page.css be scoped to the route or global?
- How does this interact with the Shadow DOM decision (#21)?

## Proposed solution: .page.css convention with per-route composition

Add `.page.css` as a recognized file type alongside `.page.ts`/`.page.html`/
`.page.md`. The route generator scans and includes them in RouteFiles.

### Per-route CSS composition (not a single bundle)

Instead of concatenating all .page.css files into one stylesheet, compose CSS
per rendered route — the same way pages are composed from the route hierarchy:

1. A `main.css` (or similar) serves as the base stylesheet (global resets,
   layout, typography)
2. For a rendered route like `/projects/42/tasks`, the server composes CSS from
   the route hierarchy: `main.css` + `index.page.css` (root layout) +
   `projects/index.page.css` + `projects/[id]/tasks.page.css`
3. Only the CSS files related to the rendered route hierarchy are included

This aligns with how pages themselves are composed — parent layout CSS is
always present when child pages render.

### HTTP/2 server push

With HTTP/2, the server can push the composed CSS alongside the HTML response.
The client receives both in a single round-trip. This eliminates the FOUC
problem without requiring a global bundle that includes every route's styles.

### Endpoint

Serve composed CSS at a predictable URL (e.g., `/__route.css?path=/projects/42`)
or push it proactively with HTTP/2.

### Changes needed

- `src/type/route.type.ts` — add `css?: string` to `RouteFiles`
- `src/route/route.matcher.ts` — add `.page.css` to matchers
- `tool/route.generator.ts` — detect .page.css, include in manifest
- `server/dev.server.ts` — add .page.css to watcher, serve composed CSS

### Blocked by

Shadow DOM decision — if Shadow DOM is adopted, styles become naturally scoped
and the composition model changes significantly. Resolve Shadow DOM first.
