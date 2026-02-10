import { WidgetComponent } from '@emkodev/emroute';

interface HeroBannerData {
  heading: string;
  subheading: string;
}

class HeroBannerWidget extends WidgetComponent<
  { heading: string; subheading?: string },
  HeroBannerData
> {
  override readonly name = 'hero-banner';

  override getData(
    { params }: { params: { heading: string; subheading?: string } },
  ) {
    return Promise.resolve({
      heading: params.heading ?? 'Welcome',
      subheading: params.subheading ?? '',
    });
  }

  override renderHTML(
    { data }: { data: HeroBannerData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '<section class="hero-banner">Loading...</section>';
    const sub = data.subheading ? `<p class="hero-banner__sub">${data.subheading}</p>` : '';
    return `<section class="hero-banner" style="padding:2.5rem 1.5rem;background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#f8fafc;border-radius:8px;margin-bottom:2rem;text-align:center">
  <h1 class="hero-banner__heading" style="margin:0 0 0.5rem;font-size:2.25rem">${data.heading}</h1>
  ${sub}
</section>`;
  }

  override renderMarkdown(
    { data }: { data: HeroBannerData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    const sub = data.subheading ? `\n\n${data.subheading}` : '';
    return `# ${data.heading}${sub}`;
  }
}

export const heroBannerWidget = new HeroBannerWidget();
