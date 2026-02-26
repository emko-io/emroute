# SSR Renderer Improvements

## ~~1. Markdown base path for links~~ ✓

Done. Server-side `rewriteMdLinks()` in `emroute.server.ts` rewrites
internal absolute links in markdown output to include the MD base path
prefix. Splits by `\n`, skips fenced code blocks, rewrites inline
`](/path)` and reference-style `[ref]: /path`. Skips links already
under a configured base path. Symmetrical with `<base href>` for HTML.

## 2. Streaming renderPage

`SsrRenderer.renderPage` should stream by default (opt-out available).

### ~~2.1 Parallel getData~~ ✓

Done. Route segments are self-contained — no data flows parent→child
through `<router-slot>`. `renderPage` now fires all `renderRouteContent`
calls via `Promise.all`, then injects slots sequentially. Applied to both
SSR (`ssr.renderer.ts`) and SPA (`base.renderer.ts`).

**Streaming approach**:

Two execution modes: **parallel** (default) and **sequential** (opt-out).

Sequential is effectively what we have today, except we flush per-slot
instead of buffering the entire page — slight UX improvement.

**Parallel mode** (`Promise.all`): fire all `loadRouteContent` calls for
the hierarchy at once. Flush each segment as soon as it's ready, but
respect order — if segment 2 resolves before segment 1, wait for 1 first.
This is the common case; route segments are self-contained.

**Sequential mode** (`await` each): process segments one at a time. Exists
for the rare edge case where a child slot needs attributes from the parent
(can't think of one today, but doesn't hurt to support). In sequential
mode, don't flush the opening `<router-slot>` tag early — hold it so
parent can attribute it. In parallel mode, flush the opening slot tag
immediately — CSS can kick in (loaders, layout reservation) before content
arrives.

**Flush granularity**: flush per slot, not per page. Each resolved segment
flushes as soon as it's ready (in order). Both HTML and MD benefit equally
— both depend on `getData`, which is the slow part.

```
parallel:
  hierarchy = ["/", "/about", "/about/me"]
  promises = hierarchy.map(loadRouteContent)  ── all fire at once
  for each promise (in order):
    await result
    flush opening slot tag (CSS loaders appear)
    flush content
    flush closing slot tag

sequential:
  for each segment:
    await loadRouteContent
    flush (slot tag + content + close together)
```

**Title**: the leaf route is known upfront from the hierarchy — use its
static `getTitle()` result in `<head>`. Dynamic title parts are lost, but
streaming only matters in `none`/`leaf` modes (no JS). Consumers with JS
(`root`/`only`) can set `document.title` client-side based on `isLeaf`.
Not our problem.

**Signal integration**: check `signal.aborted` between flushes. If client
disconnected during a `getData`, skip remaining segments.

**Error handling**: if a segment rejects (getData throws), use the
component's error renderer (`renderHTMLError`/`renderMarkdownError`) as
fallback content for that slot. If the error output includes a
`<router-slot>`, run `attributeSlots` on it — child injection continues
normally. If no slot, children below are discarded. This applies to both
parallel and sequential modes.

For streaming specifically: if a segment rejects after earlier segments
are already flushed, flush the error fallback + closing tags. Browser
gets a valid document.

**Widget resolution**: happens inside `renderRouteContent`, after page
HTML is rendered. Widget `getData` is NOT parallelizable with page
`getData` — widgets are discovered in the output. Hard constraint;
streaming doesn't change it.

**Return type**: `render()` returns `ReadableStream`. Server wraps in
`new Response(stream)`. Sequential/parallel controlled by option.

**SPA parallel**: same `Promise.all` benefit applies to SPA
`base.renderer.ts`. SPA can't stream, but it can inject each segment
into the DOM as soon as it resolves — parent layout (header, footer,
empty `<router-slot>`) paints immediately while child is still loading.
Result is even better than SSR streaming: footer appears before child
content. SSR must flush in order (child goes inside parent's slot);
SPA has no such constraint because the slot already exists in the DOM.

## ~~3. Root mode SSR depth~~ — dropped

`root` mode serves shell only — no SSR rendering. SPA takes over entirely.
Consumers who want prerendered pages use `leaf` mode instead. Partial
rendering (first segment only) adds complexity for marginal benefit; the
isLeaf/slot mechanics don't support it without a depth signal to the
renderer, and it's not worth the coupling.

## ~~4. SPA bundle chunking by root path~~ — out of scope

Code-splitting is a bundler concern, delegated to consumers. Our runtimes
are reference implementations, not production bundlers.

## 5. Spike: basePath as suffix instead of prefix

Investigate whether basePath can optionally be a suffix rather than a
prefix — e.g. `/about/me.md` instead of `/md/about/me`. This would make
URLs more natural and avoid the prefix-stripping dance in the server.
Needs exploration of routing implications, conflict with file extensions
in static serving, and whether both modes can coexist.

**Spike result**: Not viable. Static file serving uses `lastSegment.includes('.')`
to detect file requests — `/about.html` is indistinguishable from a static file.
Trie itself is unaffected (stripping happens server-side), but the server dispatch
becomes ambiguous. Content negotiation via `Accept` headers is a cleaner
alternative (no URL changes, RESTful) but breaks bookmarkability. Modern
frameworks (Next.js, Astro) all avoid suffixes — prefix-based is architecturally
superior.

## ~~6. Thread `Request.signal` through SSR pipeline~~ ✓

Done. `render(url, signal?)` → `renderPage` → `renderRouteContent` →
`loadRouteContent` → `buildComponentContext(signal)` + `getData({ signal })`.
Server passes `req.signal` at both `/html/` and `/md/` entry points.
