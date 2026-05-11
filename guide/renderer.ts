import { marked } from 'marked';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonToAttrs(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
      .join('');
  } catch {
    return '';
  }
}

marked.use({
  gfm: true,
  renderer: {
    html: ({ text }) => text,

    code: ({ text, lang }) => {
      if (lang?.startsWith('widget:')) {
        const name = lang.slice('widget:'.length);
        const attrs = jsonToAttrs(text);
        return `<widget-${name}${attrs}></widget-${name}>`;
      }
      if (lang === 'router-slot') {
        const attrs = jsonToAttrs(text);
        return `<router-slot${attrs}></router-slot>`;
      }
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${escapeHtml(text)}</code></pre>`;
    },
  },
});

export function render(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
