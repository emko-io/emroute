# SPA bundle includes SSR-only code

## Problem

When esbuild bundles `emroute.js` (the SPA entry point from `@emkodev/emroute/spa`), it includes SSR-only constructs that are dead code in the browser:

- `SsrShadowRoot` — server-side shadow root stub
- `SsrHTMLElement` — server-side HTMLElement stub
- `HTMLElementBase` — conditional base class (`globalThis.HTMLElement ?? SsrHTMLElement`)
- `STATUS_MESSAGES` — used by SSR renderer only
- Possibly other SSR-only utilities

These exist because `html.util.ts` (and the component classes) are shared between SSR and SPA. esbuild can't tree-shake them because the `HTMLElementBase` conditional reference keeps `SsrHTMLElement` alive.

## Current bundle

~62KB unminified. The SSR stubs are small but conceptually wrong — browser code shouldn't carry server polyfills.

## Possible approaches

1. **Split `html.util.ts`** into `html.util.ts` (shared) and `html-ssr.util.ts` (SSR-only). SPA imports only the shared part. esbuild tree-shakes the rest.

2. **Inline the browser-only base** — `HTMLElementBase` in the SPA entry could just be `HTMLElement` directly (it's always available in the browser). The `?? SsrHTMLElement` fallback is only needed server-side.

3. **Separate entry points** — `src/renderer/spa/mod.ts` could re-export from browser-specific modules that never import SSR code.

4. **`@__PURE__` / `/* #__PURE__ */` annotations** — mark SSR constructors so esbuild can drop them. May not work since `HTMLElementBase` references them at module scope.

## New opportunity: `dist/` and import maps

Since 1.6.3, the package ships compiled `.js` in `dist/`. This opens options:

5. **Conditional export for browser** — add a `"browser"` condition in `package.json` exports that points to a pre-built browser bundle (no SSR). esbuild respects `"browser"` condition during bundling.

6. **Import map in shell** — `writeShell()` generates `index.html` with an import map. It could map `@emkodev/emroute/spa` to a browser-optimized `.js` file from `dist/` that excludes SSR code entirely. The bundler wouldn't even need to resolve it — the browser loads it directly.

7. **Bundle from `dist/*.js` instead of source** — esbuild bundling `.js` (already compiled) may tree-shake better than `.ts` source since the SSR conditionals compile to simpler runtime checks.

## Impact

Low priority — the dead code is small. But it's a cleanliness issue and signals that the SSR/SPA boundary isn't fully separated at the module level.
