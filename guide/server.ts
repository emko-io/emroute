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
  <title>${title}</title>
  <style>@view-transition { navigation: auto; } router-slot { display: contents; }</style>
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
