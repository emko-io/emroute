ComponentElement reads data-params, not individual attributes

ComponentElement.connectedCallback() parses params from a single data-params
JSON attribute. Individual attributes are silently ignored:

<!-- BROKEN — start attribute is ignored, params = {} -->

<c-counter start="0"></c-counter>

<!-- WORKS — params = { start: "0" } -->

<c-counter data-params='{"start":"0"}'></c-counter>

Arguments for individual attributes:

- Natural HTML pattern (<input type="text" value="hello">)
- Less verbose for scalar params
- No quote escaping issues (JSON inside HTML attributes is awkward)
- Fails silently — no error when attributes are ignored, params default to {}

Arguments for keeping data-params:

- Supports complex/nested objects natively
- Single source of truth — no merging logic needed
- Consistent with how widgets are rendered from markdown fenced blocks
  (JSON params map directly to data-params)
- Component authors don't need to declare which attributes to observe
  (no static observedAttributes)
- Type safety — JSON.parse gives you the full object, individual attributes
  are always strings

Possible approaches:

- Support both: individual attributes as base, data-params as override for
  complex cases. Merge logic: data-params wins if present, otherwise collect
  all non-standard attributes as params.
- Keep data-params only, document it clearly, maybe add a helper for HTML
  templates that generates the attribute from an object.
- Use observedAttributes + attributeChangedCallback for reactive individual
  attributes (standard web component pattern, but requires each component to
  declare its attributes upfront).

---

Resolved: switched to raw HTML attributes. See
ADR-0010-data-params-over-individual-attributes.md.
