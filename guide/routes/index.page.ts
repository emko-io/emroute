import { PageComponent } from '@emkodev/emroute';
import { parseChunks, stripChunkMarkers, wrapMarkdown } from '../util/chunks.util.ts';

class HomePage extends PageComponent<Record<string, never>, null> {
  override readonly name = 'home';

  override renderMarkdown({ context }: this['RenderArgs']): string {
    if (!context.isLeaf) return '```router-slot\n```';
    return stripChunkMarkers(context.files?.md ?? '');
  }

  override renderHTML({ context }: this['RenderArgs']): string {
    const css = context.files?.css ?? '';
    const style = css ? `<style>${css}</style>\n` : '';

    if (!context.isLeaf) {
      return `${style}<div class="page">
  <aside class="page-sidebar">
    <widget-site-nav></widget-site-nav>
  </aside>
  <main class="page-main"><router-slot></router-slot></main>
</div>`;
    }

    return `${style}${this.renderLanding(context.files?.md ?? '')}`;
  }

  private renderLanding(md: string): string {
    const chunks = parseChunks(md);
    const byName = (n: string) => chunks.filter((c) => c.name === n);
    const hero = byName('hero')[0]?.content ?? '';
    const features = byName('feature');
    const showcase = byName('showcase')[0]?.content;
    const cta = byName('cta')[0]?.content;

    const featuresHtml = features.length === 0
      ? ''
      : `<section class="home-features">${features
          .map((f) => `<article class="home-feature">${wrapMarkdown(f.content)}</article>`)
          .join('')}</section>`;
    const showcaseHtml = showcase
      ? `<section class="home-showcase">${wrapMarkdown(showcase)}</section>`
      : '';
    const ctaHtml = cta
      ? `<section class="home-cta">${wrapMarkdown(cta)}</section>`
      : '';

    return `<div class="home">
  <header class="home-topbar">
    <a class="home-brand" href="">emroute</a>
    <nav class="home-topnav">
      <a href="pages">Docs</a>
      <a href="architecture">Architecture</a>
      <a href="setup">Setup</a>
    </nav>
  </header>
  <section class="home-hero">${wrapMarkdown(hero)}</section>
  ${featuresHtml}
  ${showcaseHtml}
  ${ctaHtml}
  <footer class="home-footer">
    File-based · Storage-agnostic · Zero deps · <a href="pages">Read the guide →</a>
  </footer>
</div>`;
  }
}

export default new HomePage();
