# Architecture

Deeper dives into how emroute works internally, plus historical records.

## Design and flow

- **[SPA → PWA Architecture](architecture/spa-flow)** — the four-mode model
  (none/leaf/root/only) and how the server runs in different places
  (remote vs. browser vs. service worker).
- **[SSR HTML Rendering Flow](architecture/ssr-html-flow)** — step-by-step
  request flow through the renderer pipeline.

## Migration

- **[Migrating from 1.6 to 1.7](architecture/migration-1-7)** — historical
  reference. Documents API changes when 1.7 replaced the SPA router layer,
  switched to a route tree, and separated bundling from the Runtime.

## Decision records

ADR (Architecture Decision Record) documents capturing why specific design
choices were made. See the framework's
[`doc/architecture/`](https://github.com/emko-io/emroute/tree/main/doc/architecture)
directory for the full set.
