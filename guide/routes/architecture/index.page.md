<!--==chunk:hero==-->

# Architecture

Deeper dives into how emroute works internally, plus historical records.

<!--==chunk:card==-->

## SPA → PWA flow

The four-mode model (`none` / `leaf` / `root` / `only`) and how the server
runs in different places — remote, browser, or service worker.

[Read the SPA flow →](architecture/spa-flow)

<!--==chunk:card==-->

## SSR HTML flow

Step-by-step request flow through the renderer pipeline. Where the route
tree is walked, where companions get inlined, where widgets render.

[Read the SSR flow →](architecture/ssr-html-flow)

<!--==chunk:card==-->

## Migration 1.6 → 1.7

Historical reference: the API changes when 1.7 replaced the SPA router
layer, switched to a route tree, and separated bundling from the Runtime.

[Read the migration →](architecture/migration-1-7)

<!--==chunk:detail==-->

## Decision records

ADRs (Architecture Decision Records) capture why specific design choices
were made — the principles behind file-based routing, triple rendering,
zero dependencies, and the rest.

[Browse all decisions →](decisions)
