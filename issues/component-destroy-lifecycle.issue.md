Components have no cleanup/destroy lifecycle hook

ComponentElement.disconnectedCallback() aborts the data fetch and resets
internal state, but there's no hook back into the Component class. Components
have no way to clean up timers, event listeners, subscriptions, or third-party
library state when removed from the DOM.

Example: a Preact-based counter widget with setInterval in useEffect — when the
user navigates away, emroute replaces innerHTML on the parent slot. Preact never
gets told to unmount, so the interval leaks.

The Component abstract class needs a lifecycle hook:

destroy?(): void;

ComponentElement.disconnectedCallback() should call
this.component.destroy?.() before resetting its own state.

Components would use it for:

- Clearing timers (setInterval, setTimeout)
- Removing global event listeners (window, document)
- Unmounting third-party renderers (Preact, Lit, etc.)
- Closing WebSocket connections
- Revoking object URLs

---

Resolved: added `destroy?(): void` to Component (abstract.component.ts) and
calling it as first line of disconnectedCallback() in component.element.ts.
