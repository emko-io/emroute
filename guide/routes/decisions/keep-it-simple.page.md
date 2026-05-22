# ADR-0012 · Keep It Simple

**Status**: Accepted

Drop the `SpaMode` enum (`'none' | 'leaf' | 'root' | 'only'`) from the
router. Server behavior, bundling, and routing scope are independent
concerns that belong to the server/codegen layer, not the router.

The filesystem already implies the archetype:

- No `.ts` files? Pure SSG.
- Just `widgets/`? Islands.
- A `main.ts`? SPA.
- A service worker entry? PWA.

## Why

The four-mode enum tried to encode several orthogonal decisions
(rendering, bundling, scope) into a single dimension. Combinations that
made sense weren't expressible; combinations that didn't were nominally
valid. The router didn't actually need the information — it just routed.

Removing the enum forced the architecture to make rendering an emergent
property of the file layout, which is more honest and more flexible.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0012-keep-it-simple.md)
