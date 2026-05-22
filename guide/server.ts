import { Emroute } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';
import type { MarkdownRenderer } from '@emkodev/emroute';
import { renderMarkdown } from '@emkodev/emkoma/render';

const root = import.meta.dirname!;
const runtime = new UniversalFsRuntime(root);

const markdownRenderer: MarkdownRenderer = { render: renderMarkdown };

const DESCRIPTION =
  'A file-based, storage-agnostic TypeScript router with triple rendering (SPA, SSR HTML, SSR Markdown) and zero external dependencies.';

const emroute = await Emroute.create({
  spa: 'none',
  title: 'emroute guide',
  markdownRenderer,
  shell: ({ title }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <base href="/html/">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${DESCRIPTION}">
  <meta name="theme-color" content="#050610">
  <title>${title}</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='7.5' fill='%234a6cf7'/><circle cx='7.5' cy='7.5' r='7.5' fill='%234a6cf7'/><circle cx='72.5' cy='7.5' r='7.5' fill='%234a6cf7'/><circle cx='7.5' cy='72.5' r='5.5' stroke='%234a6cf7' stroke-width='4' fill='none'/><circle cx='72.5' cy='72.5' r='5.5' stroke='%234a6cf7' stroke-width='4' fill='none'/><rect x='5.625' y='5.3125' width='3.75' height='60.9375' fill='%234a6cf7'/><rect x='5' y='7.65161' width='3.75' height='47.7747' transform='rotate(-45 5 7.65161)' fill='%234a6cf7'/><rect width='3.75' height='47.7747' transform='matrix(-0.707107 -0.707107 -0.707107 0.707107 74.99 7.65985)' fill='%234a6cf7'/><rect x='70.625' y='4.99994' width='3.75' height='61.25' fill='%234a6cf7'/></svg>">
  <style>
    @view-transition { navigation: auto; }
    router-slot { display: contents; }
    html {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  </style>
</head>
<body>
  <router-slot></router-slot>
</body>
</html>`,
}, runtime);

const port = Number(Deno.env.get('PORT') ?? '8000');

Deno.serve({ port }, async (req) =>
  await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 }),
);
