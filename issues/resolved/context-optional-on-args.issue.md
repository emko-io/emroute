# context is marked optional on DataArgs/RenderArgs but is always provided

## Problem

`DataArgs.context` and `RenderArgs.context` are typed as optional (`context?:
TContext`) in `abstract.component.ts:91-102`. In practice, every real rendering
codepath always constructs and passes context:

- SSR HTML (`ssr.renderer.ts:249-251`) — `buildComponentContext()`, always passed
- SSR MD (`md.renderer.ts:115-123`) — built via contextProvider, always passed
- SPA router (`html.renderer.ts:392-395`) — `buildComponentContext()`, always passed
- Widget resolution (`widget-resolve.util.ts:115-118`) — always passed
- ComponentElement (`component.element.ts:290-293, 340-348`) — passes `this.context`

The only codepaths that omit context are error/fallback pages:

- `ssr.renderer.ts:142,160` — `getData({ params: {} })` with no context
- `html.renderer.ts:487,508` — same pattern for SPA error pages

This causes consumer code to use defensive optional chaining everywhere
(`context?.files`, `context?.isLeaf`, `context?.basePath`) even though context
is guaranteed present in normal rendering.

## Fix

1. Make `context` required on both `DataArgs` and `RenderArgs`
2. Fix the error page codepaths to construct a minimal context:
   ```ts
   { pathname: '', pattern: '', params: {}, searchParams: new URLSearchParams() }
   ```
3. Remove `?.` optional chaining on context access in `PageComponent` and
   `WidgetComponent` default implementations (`page.component.ts:60,75,79,99,105`
   and `widget.component.ts:41,49,77,79`)

## Source

- `src/component/abstract.component.ts:91-102` — type declarations
- `src/component/page.component.ts` — defensive `context?.` access throughout
- `src/component/widget.component.ts` — same
- `src/renderer/ssr/ssr.renderer.ts:142,160` — error pages omit context
- `src/renderer/spa/html.renderer.ts:487,508` — SPA error pages omit context
- `src/renderer/component/component.renderer.ts:37-46` — passes optional context

## Resolution

Already resolved. `context` is required (no `?`) on both `DataArgs` (line 94)
and `RenderArgs` (line 101) in `abstract.component.ts`. Error page codepaths in
`ssr.renderer.ts` and `html.renderer.ts` already construct a `minCtx` with the
required `RouteInfo` fields. `component.renderer.ts` has `componentContext` as
required in its options type. The defensive `?.` chaining on `context` in
`PageComponent` and `WidgetComponent` is now redundant but harmless — can be
cleaned up separately.
