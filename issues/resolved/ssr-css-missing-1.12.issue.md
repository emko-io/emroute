# SSR declarative shadow DOM missing companion CSS in 1.12.x

## Problem

Upgrading from 1.10.x to 1.12.1 causes all widget companion CSS to disappear
from SSR output. The declarative shadow DOM `<template shadowrootmode="open">`
contains the widget's HTML but no `<style>` tags with companion CSS.

Widgets render unstyled on first paint and remain unstyled until JS hydrates
and `adoptedStyleSheets` kicks in. If JS fails (429, network error, slow
connection), widgets have no styles at all.

Before 1.11.0, widgets injected CSS manually via `renderHTML()`:
```typescript
const css = context?.files?.css ? `<style>${context.files.css}</style>` : "";
return `${css}<nav>...</nav>`;
```

1.11.0 moved CSS injection to `adoptedStyleSheets` (browser) and
`SsrShadowRoot` (SSR). The `SsrShadowRoot.innerHTML` getter serializes
adopted sheets as `<style>` tags. But in 1.12.x, the SSR output has no
`<style>` inside shadow roots — the adopted sheets aren't being populated
during SSR.

## Reproduction

1. Start with a working 1.10.x project with manual `${css}` injection
2. Upgrade to 1.12.1
3. Remove manual `${css}` from `renderHTML()` (as intended by 1.11.0)
4. Rebuild and restart server
5. View page source — `<template shadowrootmode="open">` has HTML but no
   `<style>` tags
6. On first paint: widgets are completely unstyled (no sidebar nav, huge
   icons, no layout)
7. After JS hydrates: `adoptedStyleSheets` applies and styles appear (if JS
   doesn't fail)

## Additional issues found

### Manifests reference `.ts` but runtime doesn't transpile

1.12.0 changelog says "Manifests always reference `.ts` paths" and the runtime
transpiles on the fly. But requesting a `.ts` file from the server returns raw
TypeScript source, not transpiled JS with `__files`. The `BunFsRuntime`
transpilation doesn't appear to be wired into the file serving path.

### `buildClientBundles()` no longer generates manifests

Consumers relying on `widgets.manifest.json` and `routes.manifest.json` for
SPA navigation get no manifests after rebuild. If the runtime generates them
dynamically, the SPA shell needs to know where to fetch them — but the
`routes.manifest.json` 404 causes SPA bootstrap to fail entirely:

```
Uncaught Error: [emroute] Failed to fetch /routes.manifest.json: 429
  at bootEmrouteApp (emroute.js:2471:11)
```

### No `index.html` generated

`buildClientBundles()` produces `emroute.js` and `app.js` but not
`index.html`. The SPA shell HTML is presumably served by the runtime, but
this isn't documented.

## Impact

- **Breaking for all existing consumers** upgrading from 1.10.x/1.11.0
- Widgets are unstyled on first paint (SSR regression)
- SPA bootstrap fails if manifest endpoint is unavailable
- No migration guide for the new runtime-serves-everything model

## Expected behavior

1. SSR output includes `<style>` tags inside declarative shadow DOM (from
   companion CSS files)
2. First paint matches final styled state (no FOUC)
3. `adoptedStyleSheets` in browser is additive, not the only CSS path
4. Clear migration guide for build-step → runtime-serving transition

## Workaround

Stay on 1.11.0 or keep manual `${css}` injection in `renderHTML()`.
