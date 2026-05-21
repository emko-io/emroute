import { WidgetComponent } from '@emkodev/emroute';

interface NavItem {
  label: string;
  href: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavData {
  sections: NavSection[];
  pathname: string;
}

const STATIC_SECTIONS: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { label: 'Setup', href: 'setup' },
      { label: 'Setup · Bun', href: 'setup/bun' },
      { label: 'Setup · Node', href: 'setup/node' },
      { label: 'Setup · Deno', href: 'setup/deno' },
      { label: 'First Route', href: 'first-route' },
      { label: 'Pages', href: 'pages' },
      { label: 'Routing', href: 'routing' },
      { label: 'Nesting', href: 'nesting' },
    ],
  },
  {
    title: 'Components',
    items: [
      { label: 'Widgets', href: 'widgets' },
      { label: 'Shadow DOM', href: 'shadow-dom' },
      { label: 'Styling', href: 'styling' },
      { label: 'Markdown Layout', href: 'markdown-layout' },
    ],
  },
  {
    title: 'Server',
    items: [
      { label: 'Server Setup', href: 'server' },
      { label: 'Runtime', href: 'runtime' },
      { label: 'SPA Mode', href: 'spa-mode' },
      { label: 'Error Handling', href: 'error-handling' },
      { label: 'Browser JS', href: 'browser-js' },
      { label: 'Hono', href: 'hono' },
    ],
  },
  {
    title: 'Markdown',
    items: [
      { label: 'Renderers', href: 'markdown-renderer' },
      { label: 'marked', href: 'markdown-renderer/marked' },
      { label: 'markdown-it', href: 'markdown-renderer/markdown-it' },
      { label: 'emkoma', href: 'markdown-renderer/emkoma' },
    ],
  },
  {
    title: 'Architecture',
    items: [
      { label: 'Overview', href: 'architecture' },
      { label: 'Migration 1.6 → 1.7', href: 'architecture/migration-1-7' },
      { label: 'SPA Flow', href: 'architecture/spa-flow' },
      { label: 'SSR HTML Flow', href: 'architecture/ssr-html-flow' },
    ],
  },
];

class SiteNavWidget extends WidgetComponent<Record<string, never>, NavData> {
  override readonly name = 'site-nav';

  override getData(args: this['DataArgs']): Promise<NavData> {
    const ctx = args.context as unknown as { pathname?: string; url?: URL };
    const pathname = ctx.pathname ?? ctx.url?.pathname ?? '/';
    return Promise.resolve({ sections: STATIC_SECTIONS, pathname });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    if (!data) return '<nav class="site-nav"></nav>';

    const normalize = (p: string): string => {
      // Strip /html, /md, /app prefixes and leading slash.
      const stripped = p.replace(/^\/(html|md|app)/, '');
      return stripped.replace(/^\/+/, '').replace(/\/+$/, '');
    };
    const current = normalize(data.pathname);

    const renderSection = (s: NavSection): string => {
      const items = s.items
        .map((it) => {
          const isActive = it.href === current;
          const cls = isActive ? ' class="active"' : '';
          const ariaCurrent = isActive ? ' aria-current="page"' : '';
          return `      <li><a href="${it.href}"${cls}${ariaCurrent}>${it.label}</a></li>`;
        })
        .join('\n');
      return `  <section>
    <h3>${s.title}</h3>
    <ul>
${items}
    </ul>
  </section>`;
    };

    return `<nav class="site-nav" aria-label="Site navigation">
  <a class="brand" href=".">emroute</a>
${data.sections.map(renderSection).join('\n')}
</nav>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    if (!data) return '';
    return data.sections
      .map((s) => {
        const items = s.items
          .map((it) => `- [${it.label}](${it.href})`)
          .join('\n');
        return `### ${s.title}\n\n${items}`;
      })
      .join('\n\n');
  }
}

export default new SiteNavWidget();
