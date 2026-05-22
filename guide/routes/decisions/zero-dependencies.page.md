# ADR-0006 · Native APIs, Zero Dependencies

**Status**: Accepted

Build only on platform natives:

- **Routing**: URLPattern
- **Components**: Custom Elements, Shadow DOM (later: light DOM)
- **Navigation**: Navigation API (with History fallback removed in ADR-0014)
- **Data**: `fetch`, AbortController
- **Templating**: tagged template literals — no JSX, no VDOM

No npm runtime deps. The whole framework is what the browser already
ships.

## Why

Every other router is married to a framework. Pick a router, you've
picked React or Vue or Svelte. emroute's reason to exist is to route
without that commitment.

Zero deps means: no bundle overhead, no peer-dependency conflicts, no
six-month migration when React 19 changes a hook. The platform doesn't
break itself.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0006-native-apis-zero-dependencies.md)
