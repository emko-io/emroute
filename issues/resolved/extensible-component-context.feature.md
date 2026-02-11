# Extensible Component Context

Allow consumers to inject app-level services (RPC clients, auth, feature flags,
etc.) into `ComponentContext` so that components can access them from `getData`
and render methods via `context.myService()`.

## Motivation

Today `ComponentContext` is a closed interface (`RouteInfo + files + signal`).
Components that need external services must import them directly or close over
module-scoped instances, which couples component code to specific
implementations and makes testing harder.

A consumer should be able to write:

```ts
override async getData({ params, context }: this['DataArgs']) {
  return context!.call<Project>('getProject', { id: params.id });
}
```

## Design — Combined approach (Option C)

Two complementary mechanisms, both fully additive:

### 1. Runtime: context provider callback on routers

A single `extendContext` callback registered once at router creation. The
framework builds the base `ComponentContext`, then calls the provider to enrich
it before passing it to any component.

```ts
// Browser
createSpaHtmlRouter(manifest, {
  extendContext: (base) => ({ ...base, call: rpcClient.call }),
});

// Server
new SsrHtmlRouter(manifest, {
  extendContext: (base) => ({ ...base, call: rpcClient.call }),
});
```

### 2. Types: third generic `TContext` on Component

```ts
abstract class Component<
  TParams = unknown,
  TData = unknown,
  TContext extends ComponentContext = ComponentContext,
> {
  declare readonly DataArgs: {
    params: TParams;
    signal?: AbortSignal;
    context?: TContext;
  };
  declare readonly RenderArgs: {
    data: TData | null;
    params: TParams;
    context?: TContext;
  };
}
```

Consumers choose the typing strategy that fits:

- **Module augmentation** (app-wide, zero per-component boilerplate):
  ```ts
  declare module 'emroute' {
    interface ComponentContext {
      call<T>(method: string, params: unknown): Promise<T>;
    }
  }
  ```
- **Third generic** (explicit per-component):
  ```ts
  class MyPage extends PageComponent<Params, Data, AppContext> { ... }
  ```

## Implementation

### Context provider type

```ts
type ContextProvider = (base: ComponentContext) => ComponentContext;
```

### Sites that construct context (all four must apply the provider)

| Site                                   | File                                | Change                                                              |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| `RouteCore.buildComponentContext()`    | `src/route/route.core.ts`           | Accept optional `ContextProvider`, apply after building base object |
| `SpaHtmlRouter.renderRouteContent()`   | `src/renderer/spa/html.renderer.ts` | Store provider from options, pass to `buildComponentContext`        |
| `ComponentElement.connectedCallback()` | `src/element/component.element.ts`  | Static `contextProvider` setter, apply to inline context            |
| `resolveWidgetTags()`                  | `src/util/widget-resolve.util.ts`   | Accept optional provider param, apply to `{...routeInfo, files}`    |

### Threading the provider into ComponentElement

Widgets in the browser build context independently in `connectedCallback`. A
static setter keeps the registration API unchanged:

```ts
class ComponentElement {
  private static contextProvider?: ContextProvider;

  static setContextProvider(provider: ContextProvider): void {
    ComponentElement.contextProvider = provider;
  }
}
```

Called once during `createSpaHtmlRouter` when `extendContext` is provided.

### Changes to Component class hierarchy

- `Component<TParams, TData, TContext>` — add third generic with default
- `PageComponent<TParams, TData, TContext>` — propagate
- `WidgetComponent<TParams, TData, TContext>` — propagate

### Changes to SsrHtmlRouter

- Add `extendContext?: ContextProvider` to `SsrHtmlRouterOptions`
- Pass provider to `RouteCore.buildComponentContext()` in `renderRouteContent`
- Pass provider to `resolveWidgetTags()` for widget context construction

### Changes to SpaHtmlRouter

- Accept `extendContext` in a new options parameter on constructor /
  `createSpaHtmlRouter`
- Pass provider to `RouteCore.buildComponentContext()` in `renderRouteContent`
- Call `ComponentElement.setContextProvider()` during initialization

## Not a breaking change

- Third generic defaults to `ComponentContext` — all existing
  `Component<Params, Data>` usage compiles without modification.
- `extendContext` is optional — omitting it preserves current behavior in all
  four construction sites.
- Module augmentation is purely opt-in by the consumer.
- No existing public API signatures change; only new optional fields are added.
