import { escapeHtml, WidgetComponent } from '@emkodev/emroute';

interface CodeBlockData {
  language: string;
  code: string;
  filename?: string;
}

class CodeBlockWidget extends WidgetComponent<
  { language?: string; code: string; filename?: string },
  CodeBlockData
> {
  override readonly name = 'code-block';

  override getData(
    { params }: { params: { language?: string; code: string; filename?: string } },
  ) {
    return Promise.resolve({
      language: params.language ?? '',
      code: params.code ?? '',
      filename: params.filename,
    });
  }

  override renderHTML(
    { data, context }: {
      data: CodeBlockData | null;
      params: Record<string, unknown>;
      context?: { files?: { css?: string } };
    },
  ): string {
    if (!data) return '';
    const style = context?.files?.css ? `<style>${context.files.css}</style>\n` : '';
    // All styles in companion CSS file - no inline styles needed
    return `${style}<pre><code>${escapeHtml(data.code)}</code></pre>`;
  }

  override renderMarkdown(
    { data }: { data: CodeBlockData | null; params: Record<string, unknown> },
  ): string {
    if (!data) return '';
    return `\`\`\`${data.language}\n${data.code}\n\`\`\``;
  }
}

export const codeBlockWidget = new CodeBlockWidget();
