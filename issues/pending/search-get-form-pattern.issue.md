# Search as GET Form Pattern

## Problem

The articles search widget uses inline JS to filter DOM elements client-side.
This doesn't work in `none` mode (no JS) and breaks across Shadow DOM boundaries.

## Proposed Pattern

Replace client-side-only filtering with a GET form that works server-side:

```html
<form method="get" action="/html/articles">
  <input type="search" name="q" placeholder="Filter articles..." value="{{currentQuery}}">
  <button type="submit">Search</button>
</form>
```

### How it works

1. **No JS (`none`)**: Form submits GET request, server reads `?q=triple` from
   query params, `getData()` filters articles, returns filtered HTML.
2. **With JS (`leaf`/`root`)**: JS intercepts form submit, either:
   a. Prevents default and filters client-side (progressive enhancement), or
   b. Lets the form submit naturally (works everywhere).
3. **SPA (`root`/`only`)**: Router intercepts navigation to same page with new
   query params, re-runs `getData()` with `context.searchParams`.

### Server-side support

`getData()` already receives `context.searchParams` — use it:

```typescript
override getData({ params, context }) {
  const query = context?.searchParams?.get('q') ?? '';
  const articles = ALL_ARTICLES.filter(a =>
    !query || a.title.toLowerCase().includes(query.toLowerCase())
  );
  return { articles, query };
}
```

## Impact

- Works in all four SPA modes
- URL is shareable (`/html/articles?q=triple`)
- Progressive enhancement done right
- Good pattern to document for consumers
