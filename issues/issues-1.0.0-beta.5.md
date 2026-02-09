# Issues — 1.0.0-beta.5

Backward-incompatible issues found during code review. Fixing any of these
will change public API, output format, or observable behavior.

---

## 1. ~~SPA link interception swallows modifier-key clicks~~ — RESOLVED

**File:** `src/renderer/spa/html.renderer.ts:72–91`

The click handler intercepts all link clicks without checking modifier keys.
Ctrl+click (new tab on Win/Linux), Cmd+click (new tab on Mac), Shift+click
(new window), middle-click, and Alt+click (download) are all swallowed by
`e.preventDefault()`.

Every mainstream SPA router checks these. Currently users cannot open links
in new tabs via keyboard shortcuts.

**Fix:** Add guard before `preventDefault`:

```ts
if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
```

**Breaking:** Clicks that were previously intercepted and routed via SPA will
now pass through to the browser's default behavior.

**Resolution:** Added modifier key and button guard in
`src/renderer/spa/html.renderer.ts`. Ctrl/Cmd/Shift/Alt + click and
non-left-button clicks now pass through to the browser.

---

## 2. ~~`Component.renderHTML` default drops `context` when delegating to `renderMarkdown`~~ — RESOLVED

**File:** `src/component/abstract.component.ts:80`

```ts
const markdown = this.renderMarkdown({ data: args.data, params: args.params });
```

`context` is available in `args` but is not forwarded.
`WidgetComponent.renderHTML` falls through to `super.renderHTML(args)` for
widgets that only have a css file (no html/md). Any widget whose
`renderMarkdown` depends on `context.files` will silently get `undefined`
files in this path.

**Fix:** Pass `context`:

```ts
this.renderMarkdown({ data: args.data, params: args.params, context: args.context });
```

**Breaking:** `renderMarkdown` implementations that checked for
`context === undefined` to detect "called from HTML fallback" will now
receive context.

**Resolution:** Forwarded `context` to `renderMarkdown` in
`src/component/abstract.component.ts`.

---

## 3. ~~`renderComponent()` utility missing `context` parameter~~ — RESOLVED

**File:** `src/renderer/component/component.renderer.ts:16–45`

The exported `renderComponent` function — part of the public API — calls
`getData({ params, signal })` and `renderMarkdown({ data, params })` /
`renderHTML({ data, params })` without ever accepting or forwarding a
`ComponentContext`.

Any component that depends on `context.files`, `context.pathname`, or
`context.signal` will get `undefined` when rendered through this utility.

**Fix:** Add `context?: ComponentContext` to `options` and forward it to
`getData` and render calls.

**Breaking:** Function signature change.

**Resolution:** Added optional `context` to the options type and forwarded it
to `getData`, `renderHTML`, and `renderMarkdown` in
`src/renderer/component/component.renderer.ts`.

---

## 4. ~~Module-level singleton instances~~ — WONT FIX

**Files:**

- `src/component/page.component.ts:12` — `export default new DefaultPageComponent()`
- `src/widget/page-title.widget.ts:54` — `export const pageTitleWidget = new PageTitleWidget()`
- `src/widget/breadcrumb.widget.ts:106` — `export const breadcrumbWidget = new BreadcrumbWidget()`
- `src/renderer/spa/mod.ts:23` — `export const builtInWidgets = new WidgetRegistry()`

All four are module-level singletons. The renderer files
(`spa/html.renderer.ts`, `ssr/html.renderer.ts`, `ssr/md.renderer.ts`) all
import and share the same `defaultPageComponent` instance.

If a consumer runs SPA and SSR in the same process (e.g., SSR pre-render +
SPA hydration in a test harness), they share instances with potentially stale
state. Also, `MarkdownElement.renderer` / `rendererInitPromise` are static
class fields — another form of singleton state.

**Fix:** Export classes only; let consumers instantiate. For
`defaultPageComponent`, consider a factory or per-router-instance creation.

**Breaking:** All `import { pageTitleWidget }` / `import default` patterns
change to class imports + instantiation.

**Resolution:** Not fixing. These components are stateless — `getData` is
pure, render methods are pure. Shared instances have no mutable state to
leak across SPA/SSR boundaries.

---

## 5. ~~`@emkodev/emroute/spa` import has module-level side effects~~ — WONT FIX

**File:** `src/renderer/spa/mod.ts:28–32`

```ts
if (globalThis.customElements) {
  for (const widget of builtInWidgets) {
    ComponentElement.register(widget);
  }
}
```

Importing the `./spa` entry point immediately registers `widget-page-title`
and `widget-breadcrumb` as custom elements. There is no opt-out. If a
consumer wants to register their own page-title widget, the built-in one is
already registered and `customElements.define` will silently skip theirs
(or throw in strict checks).

**Fix:** Remove auto-registration; let consumers call an explicit
`registerBuiltInWidgets()` or register selectively.

**Breaking:** Consumers relying on auto-registration must add an explicit
call.

**Resolution:** Not fixing. Auto-registration is the intended DX — import
the SPA entry and built-in widgets just work. Consumers who need custom
widgets can register them before importing the SPA module.

---

## 6. ~~`WidgetRegistry` accepts `Component` instead of `WidgetComponent`~~ — RESOLVED

**File:** `src/widget/widget.registry.ts:15`

```ts
private widgets = new Map<string, Component>();
```

The registry is conceptually for widgets, but its type constraint allows any
`Component`, including `PageComponent`. This means a page could be
accidentally registered as a widget without any type error.

**Fix:** Change to `Map<string, WidgetComponent>` and constrain `add`/`get`
signatures.

**Breaking:** Anyone who registered a plain `Component` (not extending
`WidgetComponent`) will get a type error.

**Resolution:** Changed `Map<string, Component>` to
`Map<string, WidgetComponent>` and updated `add`/`get` signatures in
`src/widget/widget.registry.ts`.

---

## 7. ~~SSR renderers ignore `statusPages` and `errorBoundaries`~~ — RESOLVED

**Files:**

- `src/renderer/ssr/html.renderer.ts:76–80, 98–109`
- `src/renderer/ssr/md.renderer.ts:59–64, 81–93`

When the SPA router encounters a 404, it renders the user's custom
`404.page.ts` component via `renderStatusPage → getStatusPage`. The SSR
renderers hard-code inline HTML/Markdown instead:

```ts
// SSR HTML:
return `<h1>${STATUS_MESSAGES[status] ?? 'Error'}</h1><p>Path: ${escapeHtml(pathname)}</p>`;
```

Error boundaries (`findErrorBoundary`) are also unused in SSR. A user who
defines custom 404/error pages will see them in SPA mode but get generic
messages from SSR.

**Fix:** Load and render status page components in SSR, same as SPA.

**Breaking:** SSR error output changes from hard-coded messages to
user-defined component output.

**Resolution:** Both SSR HTML and SSR Markdown renderers now use
`renderRouteContent` for status pages (404, Response errors), falling back
to inline `renderStatusPage` only when no custom status page is defined or
rendering fails. Also fixed the route generator (`tool/route.generator.ts`)
to properly merge multiple file types for status pages (e.g.,
`404.page.html` + `404.page.md`) instead of overwriting.

---

## 8. ~~SSR `<router-slot>` replacement is too strict~~ — RESOLVED

**File:** `src/renderer/ssr/html.renderer.ts:144`

```ts
result = result.replace(/<router-slot><\/router-slot>/, html);
```

Only matches the exact string `<router-slot></router-slot>`. If a page
component overrides `renderHTML` to produce
`<router-slot class="main"></router-slot>` or
`<router-slot data-layout="sidebar"></router-slot>`, SSR nesting silently
breaks — the child content is never injected.

**Fix:** Use a regex that tolerates attributes:
`/<router-slot[^>]*><\/router-slot>/`

**Breaking:** If rendered content accidentally contained
`<router-slot foo></router-slot>` that was NOT intended as a slot, it would
now be replaced.

**Resolution:** Changed the slot replacement regex to
`/<router-slot[^>]*><\/router-slot>/` in
`src/renderer/ssr/html.renderer.ts`.

---

## 9. ~~`processFencedSlots` / `processFencedWidgets` coupled to specific markdown HTML output~~ — WONT FIX

**File:** `src/util/html.util.ts:39–42, 54–56`

Both functions match a specific pattern the markdown renderer is expected to
produce:

```
<pre><code (?:data-language|class)="(?:language-)?router-slot">
```

This assumes fenced code blocks render as
`<pre><code data-language="...">` or `<pre><code class="language-...">`.
Many markdown renderers produce different formats:

- `<pre><code class="hljs language-router-slot">`
- `<pre class="language-router-slot"><code>`
- `<pre><code class="router-slot">`

Any renderer that doesn't match these exact patterns will silently fail to
convert fenced slots/widgets.

**Fix:** Either accept a broader regex pattern, or take the conversion
approach out of HTML post-processing entirely (resolve at markdown AST level
or pass a pluggable converter).

**Breaking:** A broader regex could match content that previously passed
through unchanged.

**Resolution:** Not fixing. The `<pre><code class="language-...">` pattern
is the standard output across CommonMark-compliant renderers. The current
regex already covers both `data-language` and `class="language-..."` forms.
The `<pre><code>` approach also provides graceful degradation — unrecognized
widgets still display their content as a code block rather than being
invisible.

---

## 10. `PageTitleWidget` has render-time side effect, is no-op in SSR

**File:** `src/widget/page-title.widget.ts:30–37`

```ts
override renderHTML(args) {
  const title = args.data?.title ?? args.params.title;
  if (title && typeof document !== 'undefined') {
    document.title = title;
  }
  return '';
}
```

Two problems:

1. **Side effect in render:** `renderHTML` mutates `document.title`. Render
   methods should be pure — they return strings. Side effects make SSR/SPA
   parity impossible and break any "render to string" testing.
2. **No-op in SSR:** The `typeof document` guard means SSR gets an empty
   string. There is no mechanism for a widget to communicate a title to
   the SSR renderer (unlike `PageComponent.getTitle()`).

**Fix:** Add a `getTitle()` or metadata protocol to widgets; move title
setting to the router/host layer.

**Breaking:** Widget contract changes — renderHTML becomes pure, title
mechanism moves elsewhere.

---

## 11. `parseAttrsToParams` only handles double-quoted attributes

**File:** `src/util/html.util.ts:158`

```ts
const attrPattern = /([a-z][a-z0-9-]*)="([^"]*)"/gi;
```

Only matches `attr="value"`. Single-quoted attributes (`attr='value'`),
unquoted attributes (`attr=value`), and boolean attributes (`disabled`) are
silently ignored. This affects both `resolveWidgetTags` (SSR) and is
inconsistent with how browsers parse HTML.

**Fix:** Support single quotes, unquoted values, and boolean attributes.

**Breaking:** Attributes previously ignored will now be parsed and passed as
params, potentially changing widget behavior.

---

## 12. `resolveWidgetTags` self-closing syntax diverges from HTML spec

**File:** `src/util/html.util.ts:101`

```
<widget-([a-z][a-z0-9-]*)(\s[^>]*?)\/>
```

The regex matches self-closing custom element syntax (`<widget-foo />`).
However, HTML parsers treat `<widget-foo />` identically to `<widget-foo>` —
the `/` is ignored and the tag remains open. This means:

- SSR (regex-based): Sees `<widget-foo />` as self-closing, resolves it.
- Browser (DOM-based): Sees `<widget-foo>` as opening tag, everything after
  becomes children.

This SSR/SPA mismatch can cause hydration and layout issues.

**Fix:** Either stop supporting self-closing in SSR (match only paired
tags), or document it clearly and add matching behavior in the browser
hydration path.

**Breaking:** SSR output changes for self-closing widget tags.

---

## 13. `PageComponent.renderHTML` ignores `.md` when `.html` template contains `<mark-down>`

**File:** `src/component/abstract.component.ts:174–176`

```ts
if (files?.html) {
  return style + files.html;
}
```

When a route has both `.page.html` and `.page.md`, the `.html` branch
returns the HTML template directly without injecting the `.md` content.
If the HTML template contains `<mark-down></mark-down>` as a placeholder
for markdown content, it remains empty.

In SPA mode this works because the `<mark-down>` custom element fetches
the `.md` file at runtime. In SSR, `expandMarkdown` only renders inline
content between the tags — empty tags produce empty output.

**Fix:** When `.html` is present and contains `<mark-down></mark-down>`,
inject the escaped `.md` content into the tag before returning.

**Breaking:** Pages that had empty `<mark-down></mark-down>` in their
`.html` template alongside a `.md` file will now render the markdown
content in SSR, matching SPA behavior.

**Resolution:** Added `.md` injection into empty `<mark-down>` tags in
`PageComponent.renderHTML` in `src/component/abstract.component.ts`.
When `files.html` contains `<mark-down></mark-down>` and `files.md` is
available, the empty tag is replaced with
`<mark-down>${escapeHtml(files.md)}</mark-down>` before returning.
