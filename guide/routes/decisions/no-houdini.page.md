# ADR-0016 · No CSS Houdini

**Status**: Rejected

emroute does not adopt CSS Houdini APIs (Paint, Layout, Animation
Worklet, Typed OM).

## Why

The production-ready Houdini APIs (`@property`, Typed OM) don't fix
emroute's actual CSS pain points — those are about cascade, scoping,
and shadow boundaries, not type-safe property reads. The Houdini APIs
that would help (Paint, Layout) are Chromium-only with no roadmap from
other vendors.

Houdini stalled because only Chrome invested. Building features on top
of one-vendor APIs gives consumers cliff-edge compatibility — a feature
that works in one browser and silently does nothing in others. That's
worse than the original problem.

The real solutions live in mainstream CSS: `@scope`, `@layer`,
`:defined`, Declarative Shadow DOM, container queries. These ship
everywhere and address the same problems Houdini was supposed to solve.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0016-css-houdini-apis.md)
