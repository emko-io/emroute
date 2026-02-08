# ADR-0008: No Data Caching in the Router

**Status**: Accepted
**Date**: 2026-02-07
**Decision Makers**: Development Team

## Context

Components fetch data via `getData()`. A natural question is whether the router
should cache these results — avoiding redundant requests on page reloads, back
navigation, or when the same data appears in multiple rendering contexts (SPA
hydration after SSR).

## Decision

The router will **not** cache `getData()` results. Data caching is a state
management concern, not a routing concern.

The router's job is to match URLs to components and orchestrate rendering.
Components own their data lifecycle — they decide what to fetch, when to
refetch, and how to store results. Pushing caching into the router would blur
this boundary, coupling routing logic to data semantics the router has no
knowledge of (TTL, invalidation, user-specific data, etc.).

Components that need caching can implement it themselves or use an external
store. The `getData()` contract already supports this — nothing prevents a
component from checking a cache before making a request.

## Consequences

### Positive

- **Clear responsibility boundary**: router matches and renders, components own
  data.
- **No hidden state**: no stale cache surprises, no invalidation bugs in the
  framework layer.
- **Simpler router**: less code, fewer edge cases, smaller surface area.

### Negative

- **No free caching**: components that want caching must implement it. This is
  intentional — caching strategy varies per component and per data source.

## References

- Related: ADR-0005 (Unified Component-Widget Model) — `getData()` interface
- Related: ADR-0003 (Triple Rendering Context) — same component renders in
  multiple contexts, each calling `getData()` independently
