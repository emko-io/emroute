import { Emroute } from '@emkodev/emroute/server';
import { UniversalFsRuntime } from '@emkodev/emroute/runtime/universal/fs';
import type { MarkdownRenderer } from '@emkodev/emroute';
import { renderMarkdown } from '@emkodev/emkoma/render';

const root = import.meta.dirname!;
const runtime = new UniversalFsRuntime(root);

const markdownRenderer: MarkdownRenderer = { render: renderMarkdown };

const emroute = await Emroute.create({
  spa: 'none',
  title: 'emroute guide',
  markdownRenderer,
}, runtime);

const port = Number(Deno.env.get('PORT') ?? '8000');

Deno.serve({ port }, async (req) =>
  await emroute.handleRequest(req) ?? new Response('Not Found', { status: 404 }),
);
