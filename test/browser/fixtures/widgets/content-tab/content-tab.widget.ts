import { escapeHtml, WidgetComponent } from '@emkodev/emroute';

interface ContentTabData {
  tabs: Array<{ label: string; content: string; id: string }>;
}

class ContentTabWidget extends WidgetComponent<
  { tabs: string; contents: string },
  ContentTabData
> {
  override readonly name = 'content-tab';

  override getData(
    { params }: { params: { tabs: string; contents: string } },
  ) {
    const labels = (params.tabs ?? '').split('|');
    const contents = (params.contents ?? '').split('|');
    const tabs = labels.map((label, i) => ({
      label: label.trim(),
      content: (contents[i] ?? '').trim(),
      id: `tab-${i}`,
    }));
    return Promise.resolve({ tabs });
  }

  override renderHTML(
    { data }: { data: ContentTabData | null; params: Record<string, unknown> },
  ): string {
    if (!data || data.tabs.length === 0) return '';

    const buttons = data.tabs.map((tab, i) => {
      const active = i === 0 ? ' background:#0f172a;color:#f8fafc;' : '';
      return `<button class="tab-btn"
        data-tab="${tab.id}"
        style="padding:0.4rem 1rem;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;background:#f8fafc;cursor:pointer;font-size:0.9rem;border-bottom:none;${active}"
        onclick="this.parentElement.querySelectorAll('.tab-btn').forEach(function(b){b.style.background='#f8fafc';b.style.color='inherit'});this.style.background='#0f172a';this.style.color='#f8fafc';this.closest('.c-tabs').querySelectorAll('.tab-panel').forEach(function(p){p.style.display='none'});this.closest('.c-tabs').querySelector('[data-panel=&quot;'+this.dataset.tab+'&quot;]').style.display='block'"
      >${escapeHtml(tab.label)}</button>`;
    }).join('\n');

    const panels = data.tabs.map((tab, i) => {
      const display = i === 0 ? 'block' : 'none';
      return `<div class="tab-panel" data-panel="${tab.id}" style="display:${display};padding:1rem;border:1px solid #e2e8f0;border-radius:0 0 6px 6px">${
        escapeHtml(tab.content)
      }</div>`;
    }).join('\n');

    return `<div class="c-tabs" style="margin:1rem 0">
  <div class="tab-bar" style="display:flex;gap:2px">${buttons}</div>
  ${panels}
</div>`;
  }

  override renderMarkdown(
    { data }: { data: ContentTabData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    return data.tabs
      .map((tab) => `### ${tab.label}\n\n${tab.content}`)
      .join('\n\n');
  }
}

export const contentTabWidget = new ContentTabWidget();
