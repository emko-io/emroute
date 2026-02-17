# data-ssr Attribute Bloat

## Problem

Widget attributes are passed as HTML attributes (e.g. `coin="bitcoin"`), and then
`data-ssr` duplicates all of them plus computed data as a JSON blob:

```html
<widget-crypto coin="bitcoin" data-ssr='{"coin":"bitcoin","price":42000,"change":1.5}'>
```

The params are stored twice: once as HTML attributes, once inside `data-ssr`. For
widgets with many params or large data objects, this significantly bloats the HTML.

## Possible Solutions

1. **Store only computed data in `data-ssr`** — strip params that are already
   available as HTML attributes. The hydration side reads params from attributes
   and merges with data-ssr.

2. **Separate `data-ssr-data` from params** — only serialize the return value of
   `getData()` minus the input params.

3. **External data store** — instead of inline JSON, use a `<script type="application/json">`
   block or a data island pattern to store widget data separately from the tag.

## Impact

- Increased HTML payload size, especially with many widgets or large data
- Redundant data transfer
- Harder to read in view-source
