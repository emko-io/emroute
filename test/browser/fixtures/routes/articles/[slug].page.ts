import { type ComponentContext, escapeHtml, PageComponent } from '@emkodev/emroute';

interface ArticleData {
  slug: string;
  title: string;
  author: string;
  date: string;
  tags: string[];
  readTime: number;
  content: string;
}

const ARTICLES: Record<string, ArticleData> = {
  'getting-started': {
    slug: 'getting-started',
    title: 'Getting Started with emroute',
    author: 'Alice',
    date: '2025-03-15',
    tags: ['tutorial', 'beginner'],
    readTime: 5,
    content: `## Installation

Add emroute to your Deno project:

\`\`\`bash
deno add jsr:@emkodev/emroute
\`\`\`

## Your First Route

Create a \`routes/\` directory and add a markdown file:

\`\`\`
routes/
  index.page.md
\`\`\`

Write some content in \`index.page.md\`:

\`\`\`markdown
# Hello World
Welcome to my emroute app!
\`\`\`

That's it. The file system IS the router.

## Running the Dev Server

Start the development server:

\`\`\`bash
deno task dev
\`\`\`

Visit \`http://localhost:1420/\` for SPA mode, \`/html/\` for SSR HTML, or \`/md/\` for SSR Markdown.`,
  },
  'file-based-routing': {
    slug: 'file-based-routing',
    title: 'File-Based Routing Explained',
    author: 'Bob',
    date: '2025-03-20',
    tags: ['routing', 'architecture'],
    readTime: 8,
    content: `## The File System IS the Router

In emroute, there is no route configuration file. Your directory structure defines your routes:

| File | URL Pattern |
|------|------------|
| \`routes/index.page.md\` | \`/\` |
| \`routes/about.page.html\` | \`/about\` |
| \`routes/blog.page.ts\` | \`/blog\` |
| \`routes/blog/[slug].page.ts\` | \`/blog/:slug\` |

## Dynamic Segments

Use brackets \`[param]\` in filenames for dynamic URL segments:

- \`routes/users/[id].page.ts\` matches \`/users/42\`, \`/users/abc\`
- \`routes/posts/[slug]/edit.page.ts\` matches \`/posts/hello-world/edit\`

Parameters are available in \`getData()\` and \`renderHTML()\` via \`params\`.

## Companion Files

A route can have multiple file types with the same stem:

- \`.page.ts\` — Component logic
- \`.page.html\` — HTML template (via context.files.html)
- \`.page.md\` — Markdown content (via context.files.md)
- \`.page.css\` — Styles (injected as \`<style>\`)

All four are optional. The fallback chain handles missing files gracefully.`,
  },
  'triple-rendering': {
    slug: 'triple-rendering',
    title: 'Triple Rendering: SPA, SSR HTML, SSR Markdown',
    author: 'Alice',
    date: '2025-04-01',
    tags: ['ssr', 'rendering'],
    readTime: 12,
    content: `## Three Modes, One Codebase

Every emroute route renders in three formats:

1. **SPA** (\`/path\`) — Client-side navigation with custom elements
2. **SSR HTML** (\`/html/path\`) — Pre-rendered HTML with hydration
3. **SSR Markdown** (\`/md/path\`) — Plain text for LLMs and CLI tools

## How It Works

Each component implements two rendering methods:

- \`renderHTML()\` — Produces HTML string
- \`renderMarkdown()\` — Produces markdown string

The same \`getData()\` method is called in all three modes.

## SSR Hydration

When the SPA loads a page that was pre-rendered by SSR HTML, it detects the \`data-ssr-route\` attribute and adopts the existing content without re-rendering. This gives instant page loads.`,
  },
  'widget-system': {
    slug: 'widget-system',
    title: 'The Widget System',
    author: 'Carol',
    date: '2025-04-10',
    tags: ['widgets', 'components'],
    readTime: 10,
    content: `## What Are Widgets?

Widgets are reusable components that can be embedded in any page. They:

- Fetch their own data independently
- Render in all three modes (HTML, Markdown, SPA)
- Register as custom elements (\`<widget-name>\`)

## Creating a Widget

Extend \`WidgetComponent\`:

\`\`\`typescript
class GreetingWidget extends WidgetComponent<{ name?: string }, { message: string }> {
  override readonly name = 'greeting';

  override async getData({ params }) {
    return { message: \\\`Hello, \${params.name ?? 'World'}!\\\` };
  }

  override renderHTML({ data }) {
    return \\\`<div>\${data?.message}</div>\\\`;
  }

  override renderMarkdown({ data }) {
    return \\\`**\${data?.message}**\\\`;
  }
}
\`\`\`

## Embedding Widgets

In markdown, use fenced blocks. In HTML, use custom element tags like \`<widget-greeting name="Dev"></widget-greeting>\`.`,
  },
  'nested-routes': {
    slug: 'nested-routes',
    title: 'Nested Routes and Layouts',
    author: 'Bob',
    date: '2025-04-18',
    tags: ['routing', 'layout'],
    readTime: 7,
    content: `## Parent-Child Composition

Routes can be nested. A parent route renders its content plus a \`<router-slot>\` where child content appears.

## File Structure

\`\`\`
routes/
  projects/
    [id].page.ts          # Parent: /projects/:id
    [id].page.html        # Parent template with <router-slot>
    [id]/
      tasks.page.ts       # Child: /projects/:id/tasks
      settings.page.ts    # Child: /projects/:id/settings
\`\`\`

## The Router Slot

The parent template includes \`<router-slot></router-slot>\`. When you visit \`/projects/42/tasks\`, the parent renders first, then the tasks child content replaces the slot.`,
  },
  'zero-deps': {
    slug: 'zero-deps',
    title: 'Zero Dependencies Philosophy',
    author: 'Carol',
    date: '2025-05-01',
    tags: ['philosophy', 'architecture'],
    readTime: 6,
    content: `## Why Zero Dependencies?

emroute has no runtime dependencies. Here's why:

## Native APIs Are Enough

- **URL matching**: \`URLPattern\` (built into Deno and modern browsers)
- **Custom elements**: \`customElements.define()\` (Web Components standard)
- **Routing**: \`history.pushState()\` / \`popstate\` (History API)
- **HTTP serving**: \`Deno.serve()\` (Deno built-in)

## Benefits

1. **No supply chain risk** — zero vulnerability surface
2. **No version conflicts** — nothing to keep in sync
3. **Instant installs** — no node_modules
4. **Predictable behavior** — you can read every line

The key principle: if a feature can be built with standard platform APIs in under 100 lines, don't add a dependency.`,
  },
};

class ArticleDetailPage extends PageComponent<{ slug: string }, ArticleData> {
  override readonly name = 'article-detail';

  override getData({ params }: { params: { slug: string } }) {
    return Promise.resolve(ARTICLES[params.slug] ?? null);
  }

  override getTitle({ data }: { data: ArticleData | null }) {
    return data ? data.title : 'Article Not Found';
  }

  override renderHTML(
    { data, params, context }: {
      data: ArticleData | null;
      params: { slug: string };
      context?: ComponentContext;
    },
  ) {
    const template = context?.files?.html ?? '<h1>Article</h1>';
    const style = context?.files?.css ? `<style>${context.files.css}</style>\n` : '';

    if (!data) {
      return style +
        `<widget-nav></widget-nav><div style="max-width:800px;margin:0 auto;padding:0 1.5rem"><h1>Article Not Found</h1><p>No article for "${
          escapeHtml(params.slug)
        }".</p><p><a href="/articles">Back to Articles</a></p></div>`;
    }

    const tags = data.tags
      .map((t) =>
        `<span style="display:inline-block;padding:0.15rem 0.5rem;background:#f1f5f9;border-radius:10px;font-size:0.8rem;color:#475569">${
          escapeHtml(t)
        }</span>`
      )
      .join(' ');

    return style + template
      .replaceAll('{{title}}', escapeHtml(data.title))
      .replaceAll('{{author}}', escapeHtml(data.author))
      .replaceAll('{{date}}', data.date)
      .replaceAll('{{readTime}}', String(data.readTime))
      .replaceAll('{{tags}}', tags)
      .replaceAll('{{slug}}', escapeHtml(data.slug))
      .replaceAll('{{content}}', `<mark-down>${escapeHtml(data.content)}</mark-down>`);
  }

  override renderMarkdown({ data }: { data: ArticleData | null; params: { slug: string } }) {
    if (!data) return '# Article Not Found\n\n[Back to Articles](/articles)';
    const tags = data.tags.map((t) => `\`${t}\``).join(', ');
    return `# ${data.title}\n\nBy ${data.author} | ${data.date} | ${data.readTime} min read | ${tags}\n\n${data.content}`;
  }
}

export default new ArticleDetailPage();
