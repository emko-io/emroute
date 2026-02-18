# Widget Reactivity & Light DOM State

## Context

The `exposeSsrData` implementation (beta.7) proved that JSON text in an
element's light DOM coexists invisibly with Declarative Shadow DOM. The browser
renders the shadow root; `textContent` reads/writes only the light DOM.

Consumers will eventually ask: "how do I update a widget after user interaction
without a full page reload?" The current answer is weak — manual `shadowRoot`
mutation or `reload()` which re-fetches from server.

## Two Layered Proposals

### Layer 1: `render(data)` — Local Re-render (reactivity primitive)

The simplest possible reactivity: "here's new data, re-render me."

Rename the existing private `render()` to `_render()`. Expose a public
`render(data)` that sets data and triggers the full pipeline
(`renderHTML()` → shadow DOM update → `hydrate()` via microtask).

```ts
// ComponentElement
private _render(): void { /* existing render logic */ }

render(data: TData): void {
  this.data = data;
  this.state = 'ready';
  this._render();
}
```

Consumer usage:

```ts
override hydrate({ data }: this['RenderArgs']) {
  let count = data?.count ?? 0;
  this.element?.querySelector('button')?.addEventListener('click', () => {
    count++;
    (this.element as ComponentElement).render({ count });
  });
}
```

This gives consumers a one-line reactivity primitive:

- No signals, no observables, no subscriptions
- No JSON serialization overhead
- No light DOM persistence
- Just "here's new data, re-render"

Reactivity story for consumers:

- **`reload()`** — server refresh (re-runs `getData()` from server)
- **`render(data)`** — local state update (skips `getData()`, re-renders)
- **Embed React/Lit/Preact** — complex interactive UI (that's what `leaf` mode is for)

### Layer 2: Light DOM State Persistence (optional, future)

Orthogonal to reactivity. Adds **inspectability and persistence** by writing
state to light DOM alongside shadow root.

Use a `WeakMap<ComponentElement, TData>` to cache parsed state, avoiding
repeated JSON parsing:

```ts
const stateCache = new WeakMap<ComponentElement, unknown>();

get state(): TData | null {
  if (stateCache.has(this)) return stateCache.get(this) as TData;
  const raw = this.textContent?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TData;
    stateCache.set(this, parsed);
    return parsed;
  } catch {
    return null;
  }
}

set state(value: TData | null) {
  stateCache.set(this, value);
  this.textContent = value !== null ? JSON.stringify(value) : '';
}
```

Could layer on top of `render(data)` — if `exposeSsrData` is set,
`render(data)` also writes to light DOM for inspection/persistence.

### Feasibility concerns for Layer 2

- **Source of truth split** — WeakMap is fast, light DOM is persistent. External
  mutations to `textContent` would make WeakMap cache stale.
- **JSON is lossy** — no Date, Map, Set, RegExp, functions, circular refs. Fine
  for API data, breaks for rich runtime state.
- **Serialization cost** — JSON.stringify on every write. Acceptable for
  infrequent updates, problematic for animation-frequency state changes.
- **`this.state` accessor location** — `Component.element` is typed
  `HTMLElement`, not `ComponentElement`. Accessing `state` requires a cast
  or type chain change.

### SSR → hydration flow (with both layers)

1. Server renders widget with `exposeSsrData = true` → JSON in light DOM
2. Client `connectedCallback()` finds `ssr` attribute → state pre-populated
3. `hydrate()` has data available via `args.data`
4. User interaction → `render(newData)` → re-renders + optionally persists

### Non-goals

- NOT a global state manager (no cross-widget reactivity)
- No persistence across page navigations (state lives in the DOM element)
- No schema validation — consumer is responsible for type safety
