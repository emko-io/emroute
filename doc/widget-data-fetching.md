# Widget Data Fetching

## SPA mode: not a problem

In SPA mode, `ComponentElement.connectedCallback()` is async but the browser
doesn't await it. When the router sets `innerHTML` on an slot, all `<widget-*>`
elements in that HTML get `connectedCallback` fired back-to-back. Their
`getData()` calls are already in flight concurrently:

```
innerHTML = html (with 3 widgets)
  → widget-1.connectedCallback() → getData() starts (not awaited)
  → widget-2.connectedCallback() → getData() starts (not awaited)
  → widget-3.connectedCallback() → getData() starts (not awaited)
  → all three fetching in parallel
```

Widgets within a single hierarchy level already parallelize for free.

The only sequential part is between hierarchy levels — the router waits for
`<mark-down>` to render before finding the `<router-slot>` for the next level.
Widgets in deeper levels don't exist in the DOM until their parent level is
rendered. But this is inherent to nested rendering — you can't inject a child
until the parent's slot exists.

## SSR mode: the actual problem

For SSR Markdown, widgets need server-side `getData()` + `renderMarkdown()`.
For SSR HTML with prefetch (option B from widget-data-prefetch.md), widgets need
server-side `getData()` to inject `data-ssr`.

In both cases, the server composes the full HTML as a string before responding.
It can scan the final output for all `<widget-*>` elements and call `getData()`
in parallel with `Promise.all`. No DOM, no connectedCallback timing — just
string processing.

The old codebase had a `composeWidgets()` function that did exactly this for
SSR Markdown. It was lost in the refactor. See widget-data-prefetch.md for the
full design discussion.

## Lazy data loading

Not all widgets need their data immediately. In SPA mode, a widget below the
fold could defer its `getData()` call until the user scrolls to it, using
`IntersectionObserver`:

```
visible widgets:  connectedCallback → getData() immediately
hidden widgets:   connectedCallback → observe → user scrolls → getData()
```

This would live inside `ComponentElement` itself — in `connectedCallback`, check
visibility before calling `loadData()`. No router involvement needed.

This only applies to SPA mode. SSR modes render the full page at once — there's
no viewport concept on the server. SSR should always fetch all widget data (when
prefetching is enabled), since the server doesn't know what the user's viewport
will be.

## Considered: script tag loading semantics

`<script>` solves the same problem (when to load, when to execute) with
`defer`, `async`, and `prefetch`. Mapped to widgets:

| Script analogy | Widget behavior                                            |
| -------------- | ---------------------------------------------------------- |
| default        | `getData()` in connectedCallback, render when done         |
| defer          | fetch data immediately, render when visible                |
| async          | fetch data, render whenever ready (same as default for us) |
| prefetch       | server fetches data, widget uses it on hydration           |

The analogy breaks down because scripts have two distinct phases (fetch +
execute) that interact with DOM parsing. Widgets are already non-blocking —
`connectedCallback` is fire-and-forget. There's no "blocking" mode to
differentiate from.

What we actually want to control is simpler:

- **When to fetch**: immediately (default) vs on-visible (lazy) vs server-side
  (ssr)
- **Whether to re-fetch**: use `data-ssr` as-is vs treat it as stale and
  refetch client-side

Two attributes (`ssr` and `lazy`) cover every combination. The script vocabulary
adds complexity without adding expressiveness.

## Promise as state (implemented)

`ComponentElement` now exposes a `dataPromise: Promise<TData | null>` field alongside
internal `ComponentState` tracking. This gives external consumers a handle to
await:

- **Multiple consumers**: anything can `await element.dataPromise`.
- **Parallel gathering**: the router collects all widget data Promises and calls
  `Promise.allSettled()`. Individual failures don't break the batch.
- **SSR prefetch**: `data-ssr` means the element hydrates with pre-fetched data,
  no fetch needed.
- **Re-fetch**: `element.reload()` aborts the previous request (via
  AbortSignal), creates a fresh AbortController, and starts a new `getData()`
  call.

AbortSignal is forwarded to `getData()` via the args object (`{ params, signal }`). When an element
disconnects, the AbortController aborts all in-flight fetch calls. After await,
the element checks `signal.aborted` before touching the DOM.

## Open questions

- Should lazy loading be opt-in (a `lazy` attribute on the widget tag) or the
  default?
- How does lazy interact with the `ssr` per-usage flag? A widget with `ssr` gets
  server-prefetched data on first load — lazy wouldn't apply there. But on
  subsequent SPA navigations (no SSR), it could defer.
