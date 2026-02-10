import { escapeHtml, WidgetComponent } from '@emkodev/emroute';

interface StatCardData {
  label: string;
  value: string;
  trend: string;
}

class StatCardWidget extends WidgetComponent<
  { label: string; value: string; trend: string },
  StatCardData
> {
  override readonly name = 'stat-card';

  override getData(
    { params }: { params: { label: string; value: string; trend: string } },
  ) {
    return Promise.resolve({
      label: String(params.label ?? ''),
      value: String(params.value ?? '0'),
      trend: String(params.trend ?? ''),
    });
  }

  override renderHTML(
    { data }: { data: StatCardData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '<div class="stat-card">Loading...</div>';
    return `<div class="stat-card" style="padding:1rem 1.25rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;min-width:140px">
  <p style="margin:0;font-size:0.8rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">${
      escapeHtml(data.label)
    }</p>
  <p style="margin:0.25rem 0;font-size:1.75rem;font-weight:700;color:#0f172a">${
      escapeHtml(data.value)
    }</p>
  <small style="color:#64748b">${escapeHtml(data.trend)}</small>
</div>`;
  }

  override renderMarkdown(
    { data }: { data: StatCardData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    return `**${data.label}**: ${data.value} (${data.trend})`;
  }
}

export const statCardWidget = new StatCardWidget();
