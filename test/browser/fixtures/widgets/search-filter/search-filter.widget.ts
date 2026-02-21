import { escapeHtml, WidgetComponent } from '@emkodev/emroute';

interface SearchFilterData {
  placeholder: string;
  target: string;
}

class SearchFilterWidget extends WidgetComponent<
  { placeholder?: string; target?: string },
  SearchFilterData
> {
  override readonly name = 'search-filter';

  override getData(
    { params }: { params: { placeholder?: string; target?: string } },
  ) {
    return Promise.resolve({
      placeholder: params.placeholder ?? 'Search...',
      target: params.target ?? '',
    });
  }

  override renderHTML(
    { data }: { data: SearchFilterData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    const handler = data.target
      ? `oninput="var q=this.value.toLowerCase();document.querySelectorAll('#${
        escapeHtml(data.target)
      }>*').forEach(function(el){var t=(el.shadowRoot||el).textContent.toLowerCase();el.style.display=t.indexOf(q)>=0?'':'none'})"`
      : '';
    return `<div style="margin-bottom:1rem">
  <input type="text"
    placeholder="${escapeHtml(data.placeholder)}"
    data-target="${escapeHtml(data.target)}"
    ${handler}
    style="width:100%;max-width:400px;padding:0.5rem 0.75rem;border:1px solid #cbd5e1;border-radius:6px;font-size:0.95rem">
</div>`;
  }

  override renderMarkdown() {
    return `*Search: [filter available in HTML/SPA mode]*`;
  }
}

export const searchFilterWidget = new SearchFilterWidget();
