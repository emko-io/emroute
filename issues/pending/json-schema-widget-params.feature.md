# JSON Schema for widget params, route params, and CMS form generation

## Problem

Widget params are `Record<string, unknown>` at runtime. The optional
`validateParams()` hook is manual — each widget hand-writes validation logic
returning `string | undefined`. No runtime type information exists for:

- What params a widget accepts (types, constraints, defaults, enums)
- What getData returns (shape, required fields)
- What dynamic route params expect (format, pattern)

This blocks CMS-style authoring: a browser editor can't generate param forms,
can't validate input before render, can't show a widget catalog with typed
param descriptions. TypeScript generics erase at runtime — they help
developers but not the CMS.

## Solution

Leverage emkore's existing `JsonSchema` type and `ValidatorBuilder` pattern.
Components declare a static `paramsSchema` (JSON Schema object). The framework
reads it at scan time, includes it in manifests, and validates against it
automatically.

### 1. Static paramsSchema on components

```js
// newsletter.widget.js
export default class Newsletter extends WidgetComponent {
  name = 'newsletter';

  static paramsSchema = {
    type: 'object',
    properties: {
      emailLabel: { type: 'string', minLength: 1 },
      buttonText: { type: 'string', default: 'Subscribe' },
      theme:      { type: 'string', enum: ['light', 'dark'] }
    },
    required: ['emailLabel']
  };
}
```

Works in plain JS — no TypeScript needed. CMS authors can write widgets with
self-describing params.

### 2. Manifest enrichment

`scanWidgets()` reads `paramsSchema` from the module's static field (or
default export constructor) and includes it in the widget manifest:

```json
{
  "name": "newsletter",
  "modulePath": "/widgets/newsletter/newsletter.widget.js",
  "tagName": "widget-newsletter",
  "paramsSchema": {
    "type": "object",
    "properties": {
      "emailLabel": { "type": "string", "minLength": 1 },
      "buttonText": { "type": "string", "default": "Subscribe" },
      "theme":      { "type": "string", "enum": ["light", "dark"] }
    },
    "required": ["emailLabel"]
  }
}
```

CMS reads manifest → generates param forms without loading widget modules.

### 3. Auto-validation replaces validateParams()

A small `validateAgainstSchema(data, schema)` utility (~50 lines, no deps)
runs on both server and browser:

- **SSR**: widget resolution validates parsed HTML attrs against paramsSchema
  before calling getData. Returns useful error on mismatch.
- **Browser**: `ComponentElement` validates params in `connectedCallback()`
  if schema exists. Replaces manual `validateParams()` — backward compatible
  since validateParams() remains as an override.

### 4. Route param schemas

Pages can declare schemas for dynamic route params:

```js
// users/[id]/index.page.js
export default class UserPage extends PageComponent {
  static paramsSchema = {
    type: 'object',
    properties: {
      id: { type: 'string', pattern: '^[A-Z]{4}-[0-9a-f-]{36}$' }
    }
  };
}
```

SSR returns 404 if param doesn't match, instead of passing invalid input
to getData.

### 5. Use case schema endpoint (connects emkore → emroute)

Expose ApiDefinition schemas via HTTP for client-side form validation:

```
GET /schema/create-user → JSON Schema from apiDefinitionToJsonSchema()
```

Browser fetches schema, generates form fields, validates input client-side
before RPC call. Same ValidatorBuilder validates on the server. One schema,
both sides.

## What one schema declaration drives

1. SSR param validation (server)
2. Browser param validation (ComponentElement)
3. CMS widget picker (form generation from manifest)
4. CMS authoring (inline validation while configuring widgets)
5. Widget documentation (auto-generated param docs)
6. LLM tool use (schema → function calling params)
7. Use case form generation (ApiDefinition → JSON Schema → browser forms)

## Implementation

1. Add `validateAgainstSchema(data: unknown, schema: JsonSchema): ValidationResult` to `core/util/`
2. Add optional `static paramsSchema?: JsonSchema` to `Component` base class
3. Update `scanWidgets()` to extract `paramsSchema` from loaded modules
4. Add `paramsSchema` field to `WidgetManifestEntry` type
5. Wire auto-validation into `ComponentElement.connectedCallback()` (browser)
6. Wire auto-validation into widget resolution in `html.renderer.ts` (SSR)
7. Keep `validateParams()` as optional override for custom logic beyond schema

All changes are backward compatible. Components without `paramsSchema`
behave exactly as today.

## Context

This is part of a broader direction: pages and widgets default to plain JS
(not TypeScript), making browser-side CMS authoring viable. JSON Schema
replaces TypeScript generics as the runtime type contract. emkore's
ValidatorBuilder and ApiDefinition already produce JSON Schema — this extends
the pattern into emroute's component model.
