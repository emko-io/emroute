# Page Templates

## Current state

`.page.html` files are already available to components via `context.files.html`.
The default `PageComponent.renderHTML` returns the HTML file content as-is. A
component can override `renderHTML` and use the HTML as a template with simple
string replacement:

```typescript
class ProjectPage extends PageComponent<{ id: string }> {
  readonly name = 'project';

  override renderHTML(
    { params, context }: { data: unknown; params: { id: string }; context?: PageContext },
  ): string {
    const template = context?.files?.html ?? '';
    return template
      .replace('{{id}}', params.id)
      .replace('{{title}}', `Project ${params.id}`);
  }
}
```

```html
<!-- projects/[id].page.html -->
<main>
  <h1>{{title}}</h1>
  <p>Project <strong>{{id}}</strong></p>
  <router-slot></router-slot>
</main>
```

No framework feature needed — the `.page.html` is the template, the `.page.ts`
does the substitution. The mechanism exists, it just doesn't have a name.

## What could be added

### A convention

Define `{{name}}` as the placeholder syntax. Components that use `.page.html`
as a template replace placeholders with params or data. This is a convention,
not enforced — components can still do whatever they want in `renderHTML`.

### Auto-substitution of params

`PageComponent` could auto-replace `{{param}}` placeholders with URL params
before the component sees the template. The component would only need to
override `renderHTML` for data-driven replacements:

```typescript
// In PageComponent base class
override renderHTML({ data, params, context }: { data: TData | null; params: TParams; context?: PageContext }): string {
  let html = context?.files?.html;
  if (!html) return super.renderHTML({ data, params, context });

  // Auto-replace params
  for (const [key, value] of Object.entries(params)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(String(value)));
  }

  return html;
}
```

This means a `.page.html` + `.page.ts` combo where the TS only provides data
doesn't need to override `renderHTML` at all — params are injected
automatically.

### Escaping

Raw string replacement is an XSS vector if params come from user input (URL
segments). Auto-substitution should escape by default:

- `{{param}}` — escaped (safe for HTML content)
- `{{{param}}}` — unescaped (opt-in, for trusted HTML)

Or just always escape, since URL params are untrusted input.

## What probably shouldn't be added

- **Conditionals, loops, partials** — that's a template engine. Use
  `renderHTML` with template literals instead.
- **Expression evaluation** — `{{user.name}}` or `{{count + 1}}`. Keep it to
  flat key replacement.
- **Async placeholders** — placeholders that trigger data fetching. That's what
  `getData` is for.

The value of `.page.html` templates is separation of markup from logic, not a
full template language. Complex rendering belongs in `.page.ts`.
