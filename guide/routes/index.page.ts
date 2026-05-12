import { PageComponent, escapeHtml } from '@emkodev/emroute';

class HomePage extends PageComponent<Record<string, never>, null> {
  override readonly name = 'home';

  override renderHTML({ context }: this['RenderArgs']): string {
    const css = context.files?.css ?? '';
    const md = context.files?.md ?? '';
    const main = context.isLeaf
      ? `<mark-down>${escapeHtml(md)}</mark-down>`
      : '<router-slot></router-slot>';
    const style = css ? `<style>${css}</style>\n` : '';

    return `${style}<div class="page">
  <aside class="page-sidebar">
    <widget-site-nav></widget-site-nav>
  </aside>
  <main class="page-main">${main}</main>
</div>`;
  }

  override renderMarkdown({ context }: this['RenderArgs']): string {
    if (context.isLeaf) return context.files?.md ?? '';
    return '```router-slot\n```';
  }
}

export default new HomePage();
