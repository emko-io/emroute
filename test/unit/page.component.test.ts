import { assertEquals } from '@std/assert';
import { type ComponentContext } from '../../src/component/abstract.component.ts';
import { PageComponent } from '../../src/component/page.component.ts';
import { escapeHtml } from '../../src/util/html.util.ts';

/** Build a test ComponentContext with sensible defaults. */
function testContext(
  files?: ComponentContext['files'],
): ComponentContext {
  return {
    pathname: '/',
    pattern: '/',
    params: {},
    searchParams: new URLSearchParams(),
    ...(files !== undefined ? { files } : {}),
  };
}

// ==============================================================================
// Component Name Tests
// ==============================================================================

Deno.test('PageComponent - name property returns "page"', () => {
  const component = new PageComponent();
  assertEquals(component.name, 'page');
});

Deno.test('PageComponent - is instantiable', () => {
  const component = new PageComponent();
  assertEquals(component instanceof PageComponent, true);
});

// ==============================================================================
// getData() Tests
// ==============================================================================

Deno.test('getData - returns null by default', async () => {
  const component = new PageComponent();
  const result = await component.getData({ params: {} });
  assertEquals(result, null);
});

Deno.test('getData - accepts context parameter', async () => {
  const component = new PageComponent();
  const context = testContext({ md: '# Test' });
  const result = await component.getData({ params: {}, context });
  assertEquals(result, null);
});

// ==============================================================================
// renderMarkdown() Tests
// ==============================================================================

Deno.test('renderMarkdown - returns md file content from context', () => {
  const component = new PageComponent();
  const context = testContext({ md: '# About Us\n\nWelcome to our site.' });
  const result = component.renderMarkdown({ data: undefined, params: {}, context });
  assertEquals(result, '# About Us\n\nWelcome to our site.');
});

Deno.test('renderMarkdown - returns router-slot when no md file', () => {
  const component = new PageComponent();
  const context = testContext({});
  const result = component.renderMarkdown({ data: undefined, params: {}, context });
  assertEquals(result, '```router-slot\n```');
});

Deno.test('renderMarkdown - returns router-slot when no context', () => {
  const component = new PageComponent();
  const result = component.renderMarkdown({ data: undefined, params: {} });
  assertEquals(result, '```router-slot\n```');
});

Deno.test('renderMarkdown - returns empty markdown file content', () => {
  const component = new PageComponent();
  const context = testContext({ md: '' });
  // Empty string is falsy, so falls back to router-slot
  const result = component.renderMarkdown({ data: undefined, params: {}, context });
  assertEquals(result, '```router-slot\n```');
});

Deno.test('renderMarkdown - preserves special characters in md content', () => {
  const component = new PageComponent();
  const md = '# Code\n\n```\n<div>test & stuff</div>\n```';
  const context = testContext({ md });
  const result = component.renderMarkdown({ data: undefined, params: {}, context });
  assertEquals(result, md);
});

// ==============================================================================
// renderHTML() Tests - Loading State
// ==============================================================================

Deno.test('renderHTML - returns router-slot with null data and no files', () => {
  const component = new PageComponent();
  const result = component.renderHTML({ data: null, params: {} });
  assertEquals(result, '<router-slot></router-slot>');
});

// ==============================================================================
// renderHTML() Tests - With html file in context
// ==============================================================================

Deno.test('renderHTML - returns html file from context', () => {
  const component = new PageComponent();
  const htmlContent = '<article><h1>Title</h1><p>Content</p></article>';
  const context = testContext({ html: htmlContent });
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(result, htmlContent);
});

Deno.test('renderHTML - html file takes priority over md file', () => {
  const component = new PageComponent();
  const context = testContext({
    html: '<div>HTML content</div>',
    md: '# Markdown',
  });
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(result, '<div>HTML content</div>');
});

// ==============================================================================
// renderHTML() Tests - With md file (no html)
// ==============================================================================

Deno.test('renderHTML - wraps md in <mark-down> when no html file', () => {
  const component = new PageComponent();
  const md = '# Heading';
  const context = testContext({ md });
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(result, `<mark-down>${escapeHtml(md)}</mark-down>\n<router-slot></router-slot>`);
});

Deno.test('renderHTML - escapes special characters in md content', () => {
  const component = new PageComponent();
  const md = '# Test & Title <script>alert("xss")</script>';
  const context = testContext({ md });
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(
    result,
    '<mark-down>' + escapeHtml(md) + '</mark-down>\n<router-slot></router-slot>',
  );
});

// ==============================================================================
// renderHTML() Tests - No files (slot fallback)
// ==============================================================================

Deno.test('renderHTML - returns router-slot when no files in context', () => {
  const component = new PageComponent();
  const context = testContext({});
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(result, '<router-slot></router-slot>');
});

Deno.test('renderHTML - returns router-slot when no context', () => {
  const component = new PageComponent();
  const result = component.renderHTML({ data: undefined, params: {} });
  assertEquals(result, '<router-slot></router-slot>');
});

// ==============================================================================
// Fallback Chain Tests (all 8 combinations)
// ==============================================================================

Deno.test('fallback - ts+html+md: renderHTML from html, renderMarkdown from md', () => {
  const component = new PageComponent();
  const context = testContext({ html: '<div>HTML</div>', md: '# MD' });
  assertEquals(component.renderHTML({ data: undefined, params: {}, context }), '<div>HTML</div>');
  assertEquals(component.renderMarkdown({ data: undefined, params: {}, context }), '# MD');
});

Deno.test('fallback - ts+html+no-md: renderHTML from html, renderMarkdown is router-slot', () => {
  const component = new PageComponent();
  const context = testContext({ html: '<div>HTML</div>' });
  assertEquals(component.renderHTML({ data: undefined, params: {}, context }), '<div>HTML</div>');
  assertEquals(
    component.renderMarkdown({ data: undefined, params: {}, context }),
    '```router-slot\n```',
  );
});

Deno.test('fallback - ts+no-html+md: renderHTML wraps md, renderMarkdown from md', () => {
  const component = new PageComponent();
  const md = '# Content';
  const context = testContext({ md });
  assertEquals(
    component.renderHTML({ data: undefined, params: {}, context }),
    `<mark-down>${escapeHtml(md)}</mark-down>\n<router-slot></router-slot>`,
  );
  assertEquals(component.renderMarkdown({ data: undefined, params: {}, context }), md);
});

Deno.test('fallback - ts+no-html+no-md: renderHTML is slot, renderMarkdown is slot', () => {
  const component = new PageComponent();
  const context = testContext({});
  assertEquals(
    component.renderHTML({ data: undefined, params: {}, context }),
    '<router-slot></router-slot>',
  );
  assertEquals(
    component.renderMarkdown({ data: undefined, params: {}, context }),
    '```router-slot\n```',
  );
});

// ==============================================================================
// renderHTML() Tests - With CSS file
// ==============================================================================

Deno.test('renderHTML - prepends style tag when css file with html', () => {
  const component = new PageComponent();
  const context = testContext({ html: '<div>Content</div>', css: '.page { color: red; }' });
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(result, '<style>.page { color: red; }</style>\n<div>Content</div>');
});

Deno.test('renderHTML - prepends style tag when css file with md', () => {
  const component = new PageComponent();
  const md = '# Styled';
  const context = testContext({ md, css: '.page { font-size: 16px; }' });
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(
    result,
    `<style>.page { font-size: 16px; }</style>\n<mark-down>${
      escapeHtml(md)
    }</mark-down>\n<router-slot></router-slot>`,
  );
});

Deno.test('renderHTML - no style tag when css only (no html/md)', () => {
  const component = new PageComponent();
  const context = testContext({ css: '.page { color: red; }' });
  const result = component.renderHTML({ data: undefined, params: {}, context });
  assertEquals(result, '<router-slot></router-slot>');
});

Deno.test('renderMarkdown - ignores css file', () => {
  const component = new PageComponent();
  const context = testContext({ md: '# Content', css: '.page { color: red; }' });
  const result = component.renderMarkdown({ data: undefined, params: {}, context });
  assertEquals(result, '# Content');
  assertEquals(result.includes('<style>'), false);
});

Deno.test('fallback - css+html+md: renderHTML has style+html, renderMarkdown from md', () => {
  const component = new PageComponent();
  const context = testContext({ html: '<div>HTML</div>', md: '# MD', css: 'h1 { color: blue; }' });
  assertEquals(
    component.renderHTML({ data: undefined, params: {}, context }),
    '<style>h1 { color: blue; }</style>\n<div>HTML</div>',
  );
  assertEquals(component.renderMarkdown({ data: undefined, params: {}, context }), '# MD');
});

// ==============================================================================
// Default Export Tests
// ==============================================================================

Deno.test('default export - is an instance of PageComponent', async () => {
  const { default: instance } = await import(
    '../../src/component/page.component.ts'
  );
  assertEquals(instance instanceof PageComponent, true);
});

Deno.test('default export - has name property "page"', async () => {
  const { default: instance } = await import(
    '../../src/component/page.component.ts'
  );
  assertEquals(instance.name, 'page');
});

Deno.test('default export - can call getData', async () => {
  const { default: instance } = await import(
    '../../src/component/page.component.ts'
  );
  const result = await instance.getData({ params: {} });
  assertEquals(result, null);
});

Deno.test('default export - can call renderMarkdown', async () => {
  const { default: instance } = await import(
    '../../src/component/page.component.ts'
  );
  const context = testContext({ md: 'Test' });
  const result = instance.renderMarkdown({ data: null, params: {}, context });
  assertEquals(result, 'Test');
});

Deno.test('default export - can call renderHTML', async () => {
  const { default: instance } = await import(
    '../../src/component/page.component.ts'
  );
  const context = testContext({ md: 'Data' });
  const result = instance.renderHTML({ data: null, params: {}, context });
  assertEquals(result, '<mark-down>Data</mark-down>\n<router-slot></router-slot>');
});

// ==============================================================================
// Integration Tests
// ==============================================================================

Deno.test('integration - full flow with md content only', async () => {
  const component = new PageComponent();
  const md = '# Welcome\n\n## Introduction\n\nHello world!';
  const context = testContext({ md });

  const data = await component.getData({ params: {}, context });
  assertEquals(data, null);

  const markdownOutput = component.renderMarkdown({ data, params: {}, context });
  assertEquals(markdownOutput, md);

  const htmlOutput = component.renderHTML({ data, params: {}, context });
  assertEquals(htmlOutput, `<mark-down>${escapeHtml(md)}</mark-down>\n<router-slot></router-slot>`);
});

Deno.test('integration - full flow with both html and md', async () => {
  const component = new PageComponent();
  const html = '<article><h1>Real Content</h1></article>';
  const md = '# Markdown';
  const context = testContext({ html, md });

  const data = await component.getData({ params: {}, context });

  const markdownOutput = component.renderMarkdown({ data, params: {}, context });
  assertEquals(markdownOutput, md);

  const htmlOutput = component.renderHTML({ data, params: {}, context });
  assertEquals(htmlOutput, html);
});

Deno.test('integration - component name is consistent across all methods', () => {
  const component = new PageComponent();
  assertEquals(component.name, 'page');

  const errorResult = component.renderError({
    error: new Error('Test error'),
    params: {},
  });
  assertEquals(errorResult.includes(component.name), true);
});
