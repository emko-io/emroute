# ADR-0008 · No Data Caching in the Router

**Status**: Accepted

The router does not cache `getData()` results. Each call to a route's
data hook runs fresh. Components own their own caching, deduplication,
and invalidation if they want it.

## Why

Caching looks easy until you ask the hard questions: How long? Per user?
Per query param? When a mutation in widget A happens, does it invalidate
page B? The router has no information to answer any of these — only the
component does.

Putting a cache in the router would either be wrong for most consumers
or so configurable it becomes its own framework. Better to leave the
slot empty and let the component decide. Most components don't need a
cache anyway — `fetch` already has HTTP caching.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0008-no-data-caching.md)
