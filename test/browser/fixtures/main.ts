import { bootEmrouteApp, MarkdownElement } from '@emkodev/emroute/spa';
import { renderMarkdown } from '@emkodev/emkoma/render.js';

MarkdownElement.setRenderer({ render: renderMarkdown });
await bootEmrouteApp();
