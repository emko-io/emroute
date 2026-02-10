/**
 * Nav Widget — Test Fixture
 *
 * A navigation widget that uses context.pathname to highlight the
 * active route with an "active" class. Declares an external CSS
 * file for styling, demonstrating the widget CSS feature.
 */

import { type ComponentContext, WidgetComponent } from '@emkodev/emroute';

interface NavLink {
  label: string;
  href: string;
  active: boolean;
}

interface NavData {
  links: NavLink[];
}

class NavWidget extends WidgetComponent<Record<string, unknown>, NavData> {
  override readonly name = 'nav';

  override getData(
    args: { params: Record<string, unknown>; context?: ComponentContext },
  ): Promise<NavData> {
    const pathname = args.context?.pathname ?? '/';

    const links: NavLink[] = [
      { label: 'Home', href: '/', active: false },
      { label: 'About', href: '/about', active: false },
      { label: 'Articles', href: '/articles', active: false },
      { label: 'Projects', href: '/projects', active: false },
      { label: 'Dashboard', href: '/dashboard', active: false },
      { label: 'Guide', href: '/guide', active: false },
      { label: 'Blog', href: '/blog', active: false },
      { label: 'Profile', href: '/profile', active: false },
      { label: 'Docs', href: '/docs', active: false },
    ];

    for (const link of links) {
      link.active = pathname === link.href ||
        (link.href !== '/' && pathname.startsWith(link.href + '/')) ||
        (link.href !== '/' && pathname.startsWith(link.href));
    }
    // Special case: Home is active only for exact match
    links[0].active = pathname === '/';

    return Promise.resolve({ links });
  }

  override renderHTML(
    args: { data: NavData | null; params: Record<string, unknown>; context?: ComponentContext },
  ): string {
    const { data, context } = args;
    const style = context?.files?.css ? `<style>${context.files.css}</style>\n` : '';

    if (!data) return `${style}<nav class="site-nav">Loading...</nav>`;

    const items = data.links.map((link) => {
      const cls = link.active ? ' class="active"' : '';
      return `<a href="/html${link.href}"${cls}>${link.label}</a>`;
    }).join('\n      ');

    return `${style}<nav class="site-nav">
      ${items}
    </nav>`;
  }

  override renderMarkdown(
    args: { data: NavData | null; params: Record<string, unknown> },
  ): string {
    if (!args.data) return '';
    return args.data.links
      .map((l) => l.active ? `**${l.label}**` : `[${l.label}](/html${l.href})`)
      .join(' | ');
  }
}

export const navWidget = new NavWidget();
