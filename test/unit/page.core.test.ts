/**
 * Page Component — Core Rendering Tests
 *
 * Tests the file combination behavior of PageComponent across all three
 * rendering outputs (renderHTML for SPA/SSR HTML, renderMarkdown for SSR MD).
 *
 * Scenarios:
 * 1. .page.md only — markdown renders in all modes
 * 2. .page.html + .page.md — HTML wraps around markdown via <mark-down>
 * 3. .page.ts inline override — ignores companion files
 * 4. .page.ts template — reads context.files and replaces {{slots}}
 */

import { assertEquals } from '@std/assert';
import { type ComponentContext, PageComponent } from '../../src/component/abstract.component.ts';
import { DefaultPageComponent } from '../../src/component/page.component.ts';
import { escapeHtml } from '../../src/util/html.util.ts';

// =============================================================================
// 1. .page.md only
// =============================================================================

Deno.test('md only — renderHTML wraps content in <mark-down>', () => {
  const page = new DefaultPageComponent();
  const md = '# Welcome\n\nHello world.';
  const context: ComponentContext = { pathname: '/', params: {}, files: { md } };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html, `<mark-down>${escapeHtml(md)}</mark-down>\n<router-slot></router-slot>`);
});

Deno.test('md only — renderMarkdown returns raw md content', () => {
  const page = new DefaultPageComponent();
  const md = '# Welcome\n\nHello world.';
  const context: ComponentContext = { pathname: '/', params: {}, files: { md } };

  const result = page.renderMarkdown({ data: null, params: {}, context });
  assertEquals(result, md);
});

Deno.test('md only — renderHTML escapes HTML in markdown content', () => {
  const page = new DefaultPageComponent();
  const md = '# Title <script>alert("xss")</script>';
  const context: ComponentContext = { pathname: '/', params: {}, files: { md } };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html.includes('<script>'), false);
  assertEquals(html.includes('&lt;script&gt;'), true);
});

// =============================================================================
// 2. .page.html + .page.md — combined rendering
// =============================================================================

Deno.test('html+md — renderHTML injects md into empty <mark-down> tag', () => {
  const page = new DefaultPageComponent();
  const htmlFile = '<h1>About</h1>\n<mark-down></mark-down>\n<footer>End</footer>';
  const md = '# Details\n\nMore info here.';
  const context: ComponentContext = {
    pathname: '/about',
    params: {},
    files: { html: htmlFile, md },
  };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html.includes('<mark-down></mark-down>'), false);
  assertEquals(html.includes(`<mark-down>${escapeHtml(md)}</mark-down>`), true);
  assertEquals(html.includes('<h1>About</h1>'), true);
  assertEquals(html.includes('<footer>End</footer>'), true);
});

Deno.test('html+md — renderHTML preserves HTML without <mark-down> tag', () => {
  const page = new DefaultPageComponent();
  const htmlFile = '<h1>About</h1>\n<p>Static content only.</p>';
  const md = '# Ignored markdown';
  const context: ComponentContext = {
    pathname: '/about',
    params: {},
    files: { html: htmlFile, md },
  };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html, htmlFile);
});

Deno.test('html+md — renderHTML escapes md injected into <mark-down>', () => {
  const page = new DefaultPageComponent();
  const htmlFile = '<section><mark-down></mark-down></section>';
  const md = '<img onerror="alert(1)">';
  const context: ComponentContext = { pathname: '/', params: {}, files: { html: htmlFile, md } };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html.includes('<img onerror'), false);
  assertEquals(html.includes(`<mark-down>${escapeHtml(md)}</mark-down>`), true);
});

Deno.test('html+md — renderMarkdown returns md content (ignores html)', () => {
  const page = new DefaultPageComponent();
  const htmlFile = '<h1>About</h1>\n<mark-down></mark-down>';
  const md = '# About\n\nMarkdown content.';
  const context: ComponentContext = {
    pathname: '/about',
    params: {},
    files: { html: htmlFile, md },
  };

  const result = page.renderMarkdown({ data: null, params: {}, context });
  assertEquals(result, md);
});

Deno.test('html+md+css — style prepended, md injected into <mark-down>', () => {
  const page = new DefaultPageComponent();
  const htmlFile = '<h1>Styled</h1>\n<mark-down></mark-down>';
  const md = '# Content';
  const css = '.page { color: red; }';
  const context: ComponentContext = {
    pathname: '/',
    params: {},
    files: { html: htmlFile, md, css },
  };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html.startsWith('<style>.page { color: red; }</style>'), true);
  assertEquals(html.includes(`<mark-down>${escapeHtml(md)}</mark-down>`), true);
});

// =============================================================================
// 3. .page.ts — inline override (ignores companion files)
// =============================================================================

Deno.test('ts override — renderHTML uses inline content, ignores files', async () => {
  class InlinePage extends PageComponent<{ id: string }, { name: string }> {
    override readonly name = 'project';

    override async getData({ params }: { params: { id: string } }) {
      return { name: `Project ${params.id}` };
    }

    override renderHTML({ data, params }: {
      data: { name: string } | null;
      params: { id: string };
      context?: ComponentContext;
    }) {
      if (!data) return '<p>Loading...</p>';
      return `<h1>${data.name}</h1><p class="id">ID: ${params.id}</p>`;
    }

    override renderMarkdown({ data }: {
      data: { name: string } | null;
      params: { id: string };
      context?: ComponentContext;
    }) {
      if (!data) return '';
      return `# ${data.name}`;
    }
  }

  const page = new InlinePage();
  const context: ComponentContext = {
    pathname: '/projects/42',
    params: { id: '42' },
    files: { html: '<h1>IGNORED</h1>', md: '# IGNORED' },
  };

  const data = await page.getData({ params: { id: '42' } });
  const html = page.renderHTML({ data, params: { id: '42' }, context });
  assertEquals(html, '<h1>Project 42</h1><p class="id">ID: 42</p>');
  assertEquals(html.includes('IGNORED'), false);

  const md = page.renderMarkdown({ data, params: { id: '42' }, context });
  assertEquals(md, '# Project 42');
  assertEquals(md.includes('IGNORED'), false);
});

// =============================================================================
// 4. .page.ts — template with {{slot}} replacement
// =============================================================================

Deno.test('ts template — renderHTML replaces {{slots}} from params', () => {
  class DocsPage extends PageComponent {
    override readonly name = 'docs';

    override renderHTML(
      { params, context }: {
        data: unknown;
        params: Record<string, string>;
        context?: ComponentContext;
      },
    ) {
      const template = context?.files?.html ?? '<h1>Docs</h1>';
      return template.replaceAll('{{topic}}', params.topic ?? 'general');
    }

    override renderMarkdown() {
      return '# Docs';
    }
  }

  const page = new DocsPage();
  const htmlFile = '<h1>Docs</h1>\n<p class="topic">Topic: {{topic}}</p>';
  const context: ComponentContext = {
    pathname: '/docs',
    params: {},
    files: { html: htmlFile },
  };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html, '<h1>Docs</h1>\n<p class="topic">Topic: general</p>');

  const htmlWithParam = page.renderHTML({ data: null, params: { topic: 'routing' }, context });
  assertEquals(htmlWithParam, '<h1>Docs</h1>\n<p class="topic">Topic: routing</p>');
});

Deno.test('ts template — renderHTML replaces {{slots}} from getData', async () => {
  interface ProfileData {
    name: string;
    role: string;
    bio: string;
  }

  class ProfilePage extends PageComponent<Record<string, string>, ProfileData> {
    override readonly name = 'profile';

    override async getData(
      _args: { params: Record<string, string>; context?: ComponentContext },
    ) {
      return { name: 'Alice', role: 'Engineer', bio: 'Builds things.' };
    }

    override renderHTML(
      { data, context }: {
        data: ProfileData | null;
        params: Record<string, string>;
        context?: ComponentContext;
      },
    ) {
      const template = context?.files?.html ?? '<h1>Profile</h1>';
      if (!data) return template;
      return template
        .replaceAll('{{name}}', data.name)
        .replaceAll('{{role}}', data.role)
        .replaceAll('{{bio}}', data.bio);
    }

    override renderMarkdown(
      { data }: {
        data: ProfileData | null;
        params: Record<string, string>;
        context?: ComponentContext;
      },
    ) {
      if (!data) return '# Profile';
      return `# ${data.name}\n\n**${data.role}** — ${data.bio}`;
    }
  }

  const page = new ProfilePage();
  const htmlFile =
    '<h1>{{name}}</h1>\n<p class="role">Role: {{role}}</p>\n<p class="bio">{{bio}}</p>';
  const context: ComponentContext = {
    pathname: '/profile',
    params: {},
    files: { html: htmlFile },
  };

  const data = await page.getData({ params: {}, context });

  const html = page.renderHTML({ data, params: {}, context });
  assertEquals(
    html,
    '<h1>Alice</h1>\n<p class="role">Role: Engineer</p>\n<p class="bio">Builds things.</p>',
  );

  const md = page.renderMarkdown({ data, params: {}, context });
  assertEquals(md, '# Alice\n\n**Engineer** — Builds things.');
});

Deno.test('ts template — falls back to inline default when no html file', () => {
  class DocsPage extends PageComponent {
    override readonly name = 'docs';

    override renderHTML(
      { params, context }: {
        data: unknown;
        params: Record<string, string>;
        context?: ComponentContext;
      },
    ) {
      const template = context?.files?.html ?? '<h1>Docs</h1>';
      return template.replaceAll('{{topic}}', params.topic ?? 'general');
    }

    override renderMarkdown() {
      return '# Docs';
    }
  }

  const page = new DocsPage();
  const context: ComponentContext = { pathname: '/docs', params: {}, files: {} };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html, '<h1>Docs</h1>');
});

Deno.test('ts template — renderHTML with md in context via <mark-down>', () => {
  class BlogPage extends PageComponent {
    override readonly name = 'blog';

    override renderHTML(
      { context }: { data: unknown; params: Record<string, string>; context?: ComponentContext },
    ) {
      const md = context?.files?.md ?? '';
      return `<mark-down>${md}</mark-down>\n<p class="blog-footer">Posts: 0</p>`;
    }

    override renderMarkdown(
      { context }: { data: unknown; params: Record<string, string>; context?: ComponentContext },
    ) {
      return context?.files?.md ?? '';
    }
  }

  const page = new BlogPage();
  const md = '# Blog\n\nWelcome to the blog.';
  const context: ComponentContext = { pathname: '/blog', params: {}, files: { md } };

  const html = page.renderHTML({ data: null, params: {}, context });
  assertEquals(html, `<mark-down>${md}</mark-down>\n<p class="blog-footer">Posts: 0</p>`);

  const result = page.renderMarkdown({ data: null, params: {}, context });
  assertEquals(result, md);
});
