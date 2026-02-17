# Shadow DOM Cross-Boundary Queries

## Problem

Widgets using inline event handlers (`oninput`, `onclick`) with `document.querySelector`
or `document.querySelectorAll` cannot reach elements outside their shadow root.

Example: `search-filter` widget's `oninput` handler does
`document.querySelectorAll('#article-list>*')`, but `#article-list` lives in the
parent page component's shadow root, not in the main document or the widget's
shadow root.

This breaks any widget that needs to interact with elements in sibling or parent
shadow trees.

## Affected Widgets (test fixtures)

- `search-filter` — cannot find target element across shadow boundary
- Any future widget using inline JS with cross-component DOM queries

## Possible Solutions

1. **Event-based communication** — widget dispatches a composed custom event,
   parent page listens and filters its own children. No cross-boundary queries.

2. **`getRootNode()` traversal** — walk up from the widget's shadow root to find
   the host, then query the host's parent shadow root. Fragile and couples widgets
   to DOM structure.

3. **GET form pattern for search** — the search widget submits a form with GET
   to the current URL with query params. Server-side filtering returns filtered
   results. Works in all modes including `none`. Progressive enhancement: JS
   intercepts form submit for client-side filtering.

## Recommendation

Option 3 (GET form) is the most aligned with emroute's progressive enhancement
philosophy. It works without JS (`none` mode), degrades gracefully, and the URL
becomes shareable (e.g. `/html/articles?q=triple`).
