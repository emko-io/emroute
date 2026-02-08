import { ComponentElement, createSpaHtmlRouter, MarkdownElement } from '@emkodev/emroute/spa';
import { routesManifest } from './routes.manifest.ts';
import failingWidget from './failing.widget.ts';

ComponentElement.register(failingWidget);

// Minimal markdown renderer for tests
MarkdownElement.setRenderer({
  render: (md: string) =>
    md
      .split('\n\n')
      .map((block) => {
        if (block.startsWith('# ')) return `<h1>${block.slice(2)}</h1>`;
        if (block.startsWith('## ')) return `<h2>${block.slice(3)}</h2>`;
        const withLinks = block.replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2">$1</a>',
        );
        return `<p>${withLinks}</p>`;
      })
      .join('\n'),
});

const router = await createSpaHtmlRouter(routesManifest);

(globalThis as Record<string, unknown>).__testRouter = router;
