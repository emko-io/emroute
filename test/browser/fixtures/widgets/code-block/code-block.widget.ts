import { escapeHtml, WidgetComponent } from '@emkodev/emroute';

interface CodeBlockData {
  language: string;
  code: string;
}

class CodeBlockWidget extends WidgetComponent<
  { language?: string; code: string },
  CodeBlockData
> {
  override readonly name = 'code-block';

  override getData(
    { params }: { params: { language?: string; code: string } },
  ) {
    return Promise.resolve({
      language: params.language ?? '',
      code: params.code ?? '',
    });
  }

  override renderHTML(
    { data }: { data: CodeBlockData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    const label = data.language
      ? `<small style="position:absolute;top:0.25rem;right:0.5rem;color:#94a3b8;font-size:0.75rem;text-transform:uppercase">${
        escapeHtml(data.language)
      }</small>`
      : '';
    return `<div style="position:relative;background:#1e293b;border-radius:6px;margin:1rem 0;overflow:hidden">
  ${label}
  <pre style="margin:0;padding:1rem;overflow-x:auto"><code style="color:#e2e8f0;font-size:0.9rem;font-family:monospace">${
      escapeHtml(data.code)
    }</code></pre>
</div>`;
  }

  override renderMarkdown(
    { data }: { data: CodeBlockData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    return `\`\`\`${data.language}\n${data.code}\n\`\`\``;
  }
}

export const codeBlockWidget = new CodeBlockWidget();
