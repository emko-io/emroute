import { PageComponent } from '@emkodev/emroute';
import { parseChunks, stripChunkMarkers, wrapMarkdown } from '../util/chunks.util.ts';

const LOGO_MARK = `<svg class="logo-mark" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="40" cy="40" r="7.5" fill="currentColor" />
  <circle cx="7.5" cy="7.5" r="7.5" fill="currentColor" />
  <circle cx="72.5" cy="7.5" r="7.5" fill="currentColor" />
  <circle cx="7.5" cy="72.5" r="5.5" stroke="currentColor" stroke-width="4" />
  <circle cx="72.5" cy="72.5" r="5.5" stroke="currentColor" stroke-width="4" />
  <rect x="5.625" y="5.3125" width="3.75" height="60.9375" fill="currentColor" />
  <rect x="5" y="7.65161" width="3.75" height="47.7747" transform="rotate(-45 5 7.65161)" fill="currentColor" />
  <rect width="3.75" height="47.7747" transform="matrix(-0.707107 -0.707107 -0.707107 0.707107 74.99 7.65985)" fill="currentColor" />
  <rect x="70.625" y="4.99994" width="3.75" height="61.25" fill="currentColor" />
</svg>`;

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
    <a class="page-sidebar-brand" href=".">${LOGO_MARK}<span>emroute</span></a>
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
          .map((f, i) => `<article class="home-feature" style="--i:${i}">
            <span class="home-feature-index">0${i + 1}</span>
            <div class="home-feature-body">${wrapMarkdown(f.content)}</div>
          </article>`)
          .join('')}</section>`;

    const showcaseHtml = showcase
      ? `<section class="home-showcase">
          <div class="home-showcase-window" role="presentation">
            <div class="home-showcase-titlebar">
              <span class="home-showcase-dot home-showcase-dot--red"></span>
              <span class="home-showcase-dot home-showcase-dot--yellow"></span>
              <span class="home-showcase-dot home-showcase-dot--green"></span>
              <span class="home-showcase-title">routes/about.page.md</span>
            </div>
            <div class="home-showcase-body">${wrapMarkdown(showcase)}</div>
          </div>
        </section>`
      : '';

    const ctaHtml = cta
      ? `<section class="home-cta">${wrapMarkdown(cta)}</section>`
      : '';

    return `<div class="home">
  <div class="home-gradient" aria-hidden="true"></div>
  <header class="home-topbar">
    <a class="home-brand" href="">
      ${LOGO_MARK}
      <span>emroute</span>
    </a>
    <nav class="home-topnav">
      <a href="decisions">Decisions</a>
      <a href="architecture">Architecture</a>
      <a href="setup">Setup</a>
      <a class="home-topnav-github" href="https://github.com/emkodev/emroute" aria-label="GitHub">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.17a11 11 0 0 1 5.78 0c2.2-1.48 3.16-1.17 3.16-1.17.63 1.59.23 2.76.12 3.05.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.25 5.65.41.35.78 1.05.78 2.12v3.14c0 .31.21.68.79.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
      </a>
    </nav>
  </header>

  <section class="home-hero">
    <div class="home-hero-badge">
      <span class="home-hero-badge-dot"></span>
      <span>Zero dependencies · Triple rendering</span>
    </div>
    ${wrapMarkdown(hero)}
    <div class="home-hero-install">
      <code>deno add @emkodev/emroute</code>
      <span class="home-hero-install-hint">or npm · bun · pnpm</span>
    </div>
    <div class="home-hero-proof">
      <div class="home-hero-proof-row">
        <span class="home-hero-proof-method get">GET</span>
        <code>/html/about</code>
        <span class="home-hero-proof-arrow">→</span>
        <span class="home-hero-proof-label">rendered HTML</span>
      </div>
      <div class="home-hero-proof-row">
        <span class="home-hero-proof-method get">GET</span>
        <code>/md/about</code>
        <span class="home-hero-proof-arrow">→</span>
        <span class="home-hero-proof-label">raw markdown</span>
      </div>
      <div class="home-hero-proof-row">
        <span class="home-hero-proof-method get">GET</span>
        <code>/app/about</code>
        <span class="home-hero-proof-arrow">→</span>
        <span class="home-hero-proof-label">SPA navigation</span>
      </div>
    </div>
  </section>

  ${featuresHtml}
  ${showcaseHtml}
  ${ctaHtml}

  <footer class="home-footer">
    <div class="home-footer-brand">
      ${LOGO_MARK}
      <span>emroute</span>
    </div>
    <div class="home-footer-meta">
      File-based · Storage-agnostic · Zero deps · <a href="pages">Read the guide →</a>
    </div>
  </footer>
</div>`;
  }
}

export default new HomePage();
