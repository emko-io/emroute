<!--==chunk:intro==-->

# Markdown Layout

A single `.page.md` companion is the source of truth, but `renderHTML()`
doesn't have to render it as one flat document. Insert a custom divider
(an HTML comment is a safe pick), split on it inside `renderHTML()`, and
arrange the resulting chunks however you want. Strip the divider in
`renderMarkdown()` and the `/md/*` view stays a clean, continuous document
for LLMs and curl. **This page is rendered exactly that way** — the cards
below, the callout, and the footer are all virtual chunks from one
`.page.md` file.

<!--==chunk:card==-->

## The divider

Any HTML comment works — pick a string that's distinctive enough that you
won't accidentally type it in content.

```md filepath=my-page.page.md
# Page title

Intro paragraph above the cards.

<!-- chunk -->

## First card

card body
```

HTML comments survive in most markdown renderers but never render as
visible content, so they're a clean anchor.

<!--==chunk:card==-->

## renderHTML splits

Read `context.files.md`, split on the divider, wrap each chunk in
`<mark-down>` so the renderer turns it back into HTML:

```ts filepath=my-page.page.ts
const DIVIDER = '<!-- chunk -->';

override renderHTML({ context }: this['RenderArgs']) {
  const md = context.files?.md ?? '';
  const [lead, ...cards] = md.split(DIVIDER);
  return `
    <div class="lead"><mark-down>${escapeHtml(lead.trim())}</mark-down></div>
    <div class="cards">
      ${cards.map((c) => `<div class="card"><mark-down>${escapeHtml(c.trim())}</mark-down></div>`).join('')}
    </div>
  `;
}
```

Each chunk goes through the configured markdown renderer independently —
headings still get IDs, lists still work, anything markdown does works.

<!--==chunk:card==-->

## renderMarkdown strips

Replace the divider with a blank line so the `/md/*` endpoint reads as one
continuous document — no marker litter:

```ts filepath=my-page.page.ts
override renderMarkdown({ context }: this['RenderArgs']) {
  const md = context.files?.md ?? '';
  return md.split(DIVIDER).map((s) => s.trim()).filter(Boolean).join('\n\n');
}
```

LLMs and shell scripts read `/md/my-page` as a single page — they never
see the layout machinery.

<!--==chunk:note==-->

## Skip markers inside code blocks

A naive `split()` is a literal string match: if your divider appears
inside a fenced code block — for example, a page that documents the
technique — it splits there too, breaking the demo. Walk the markdown
line-by-line and toggle an `inCodeBlock` flag on lines that start with
` ``` `, then ignore markers while the flag is on. This page uses that
approach so the example snippets can mention the marker freely without
self-splitting.

<!--==chunk:outro==-->

## Named chunks

If you want richer layouts, give markers names — `<!--==chunk:intro==-->`,
`<!--==chunk:card==-->`, `<!--==chunk:note==-->`. The parser captures the
name; `renderHTML()` then picks chunks by role and assembles them into a
specific layout instead of a generic grid. **That's how this page is
rendered** — the intro at the top, the three cards above, the callout, and
this footer live in the same `.page.md` file, each tagged with a name.

The parser is one scan of the file. Lines that match the marker pattern
become chunk boundaries; everything else accumulates into the current
chunk. The `inCodeBlock` flag makes it robust against markers inside
fenced examples.

```ts filepath=my-page.page.ts
const CHUNK_LINE = /^<!--==chunk(?::([a-z][a-z0-9-]*))?==-->$/;

function parseChunks(md: string): { name: string; content: string }[] {
  const lines = md.split('\n');
  const chunks: { name: string; content: string }[] = [];
  let currentName = '';
  let buffer: string[] = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      buffer.push(line);
      continue;
    }
    if (!inCodeBlock) {
      const match = line.match(CHUNK_LINE);
      if (match) {
        const content = buffer.join('\n').trim();
        if (content) chunks.push({ name: currentName, content });
        currentName = match[1] ?? '';
        buffer = [];
        continue;
      }
    }
    buffer.push(line);
  }
  const tail = buffer.join('\n').trim();
  if (tail) chunks.push({ name: currentName, content: tail });
  return chunks;
}

override renderHTML({ context }: this['RenderArgs']) {
  const chunks = parseChunks(context.files?.md ?? '');
  const byName = (n: string) => chunks.filter((c) => c.name === n);
  const intro = byName('intro')[0]?.content ?? '';
  const cards = byName('card');
  // ... compose layout from named chunks
}
```

The trick respects emroute's three rendering contexts: `/html/*` gets the
visual layout, `/md/*` stays semantically clean, and the SPA reuses the
same `<mark-down>` elements after navigation. There's no second source of
truth, no templating language — just one markdown file, one parse, and CSS.
