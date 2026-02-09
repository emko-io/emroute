Components render into light DOM (innerHTML), breaking self-contained model

ComponentElement sets this.innerHTML directly, which means:

- Component styles leak into the page and page styles leak into the component
- No native encapsulation — the component boundary is purely conceptual
- Developers can't write self-contained components with their own styling
  without risking collisions

The web component platform solves this with Shadow DOM
(this.attachShadow({ mode: 'open' })), which gives each component an isolated
style scope.

Cascading implications:

- <router-slot> inside a shadow root needs <slot> projection to work
- SSR hydration would need Declarative Shadow DOM
- Global theming/CSS would need CSS custom properties or ::part() to penetrate
- <mark-down> element also needs a light vs shadow decision
- Shadow DOM on <mark-down> would be the natural place for default markdown
  styles (typography, code blocks, tables) that can't be overridden by page
  CSS. Consumers would customize via CSS custom properties. But enforcing
  styles at the package level may be unwanted — consumers likely want full
  control over markdown appearance.
