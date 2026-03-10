# bootEmrouteApp does not accept extendContext

## Problem

`bootEmrouteApp()` creates an `Emroute` instance internally but does not pass
`extendContext` to `Emroute.create()`. This means the Pipeline used for SPA
page rendering has no context provider — page `getData()` during SPA navigation
does not receive enriched context (e.g., `context.rpc`).

The workaround is calling `ComponentElement.setContextProvider()` manually
before boot, which fixes widget `hydrate()` and widget `getData()`. But page
`getData()` during client-side navigation still lacks the provider because it
goes through the Pipeline, not through `ComponentElement`.

## Current behavior

```ts
// main.ts — consumer must call setContextProvider manually
ComponentElement.setContextProvider((base) => ({ ...base, rpc }));
await bootEmrouteApp();
```

- Widget `hydrate()` — gets `context.rpc` (via ComponentElement)
- Widget `getData()` — gets `context.rpc` (via ComponentElement)
- Page `getData()` during SSR — gets `context.rpc` (via emkoord's extendContext)
- Page `getData()` during SPA navigation — **no `context.rpc`** (Pipeline has no provider)

## Expected behavior

```ts
await bootEmrouteApp({
  extendContext: (base) => ({ ...base, rpc }),
});
```

`bootEmrouteApp` should:
1. Pass `extendContext` to `Emroute.create()` (fixes Pipeline for pages)
2. Call `ComponentElement.setContextProvider()` automatically (fixes widgets)

This aligns with the resolved `extensible-component-context` feature spec,
which states: "Called once during `createSpaHtmlRouter` when `extendContext` is
provided." `bootEmrouteApp` should behave the same way.

## Impact

Medium — pages that use `context.rpc` in `getData()` silently fail during SPA
navigation. The `Promise.try(...).catch(() => null)` pattern masks the error
but returns empty data.

## Resolution

Resolved in 1.8.2-beta.2.

`BootOptions.extendContext` added. `bootEmrouteApp()` passes it to both
`Emroute.create()` (Pipeline for pages) and `ComponentElement.setContextProvider()`
(widgets). `ComponentElement.setContextProvider()` marked `@deprecated`.
