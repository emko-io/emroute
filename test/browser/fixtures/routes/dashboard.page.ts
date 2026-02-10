import { type ComponentContext, escapeHtml, PageComponent } from '@emkodev/emroute';

interface DashboardStat {
  label: string;
  value: string;
  trend: string;
}

interface DashboardData {
  stats: DashboardStat[];
}

class DashboardPage extends PageComponent<Record<string, string>, DashboardData> {
  override readonly name = 'dashboard';

  override getData() {
    return Promise.resolve({
      stats: [
        { label: 'Total Articles', value: '6', trend: '+2 this month' },
        { label: 'Total Views', value: '12,450', trend: '+18%' },
        { label: 'Avg. Read Time', value: '8 min', trend: '-1 min' },
        { label: 'Active Authors', value: '3', trend: 'Stable' },
      ],
    });
  }

  override getTitle() {
    return 'Dashboard';
  }

  override renderHTML(
    { data, context }: {
      data: DashboardData | null;
      params: Record<string, string>;
      context?: ComponentContext;
    },
  ) {
    const template = context?.files?.html ?? '<h1>Dashboard</h1>';
    const style = context?.files?.css ? `<style>${context.files.css}</style>\n` : '';
    if (!data) return style + template;

    const statWidgets = data.stats
      .map((s) =>
        `<widget-stat-card label="${escapeHtml(s.label)}" value="${escapeHtml(s.value)}" trend="${
          escapeHtml(s.trend)
        }"></widget-stat-card>`
      )
      .join('\n      ');

    return style + template.replaceAll('{{statCards}}', statWidgets);
  }

  override renderMarkdown(
    { data }: { data: DashboardData | null; params: Record<string, string> },
  ) {
    if (!data) return '# Dashboard';
    const stats = data.stats.map((s) => `- **${s.label}**: ${s.value} (${s.trend})`).join('\n');
    return `# Dashboard\n\n${stats}`;
  }
}

export default new DashboardPage();
