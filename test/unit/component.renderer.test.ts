/**
 * Unit tests for ComponentRenderer
 *
 * Tests cover the core component rendering pipeline:
 * - renderComponent() with HTML and Markdown contexts
 * - Component lifecycle: validateParams → getData → render
 * - Error handling: validation errors and render errors
 * - Context passing (params, signal, componentContext)
 * - Component block parsing and replacement in markdown
 *
 * Mocks are used to control component behavior and verify
 * the renderer's correct sequencing and error propagation.
 */

import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import type { ComponentContext } from '../../src/component/abstract.component.ts';
import { Component } from '../../src/component/abstract.component.ts';
import {
  parseComponentBlocks,
  type ParsedComponentBlock,
  renderComponent,
  replaceComponentBlocks,
} from '../../src/renderer/component/component.renderer.ts';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

/**
 * Create a mock ComponentContext
 */
function createMockContext(
  overrides?: Partial<ComponentContext>,
): ComponentContext {
  return {
    pathname: '/test',
    pattern: '/test',
    params: {},
    searchParams: new URLSearchParams(),
    ...overrides,
  };
}

/**
 * Create a mock Component for testing
 */
class MockComponent extends Component {
  readonly name = 'mock-component';

  validateParamsResult?: string;
  hasValidateParams = true;
  getDataCalled = false;
  getDataParams?: unknown;
  getDataSignal?: AbortSignal;
  getDataContext?: ComponentContext;
  getDataReturnValue: unknown = { title: 'Mock Data' };

  renderHTMLCalled = false;
  renderHTMLData?: unknown;
  renderHTMLParams?: unknown;
  renderHTMLContext?: ComponentContext;
  renderHTMLReturnValue = '<div>Mock HTML</div>';

  renderMarkdownCalled = false;
  renderMarkdownData?: unknown;
  renderMarkdownParams?: unknown;
  renderMarkdownContext?: ComponentContext;
  renderMarkdownReturnValue = '# Mock Markdown';

  renderErrorCalled = false;
  renderErrorValue?: unknown;
  renderErrorParams?: unknown;
  renderErrorReturnValue = '<div class="c-error">Error</div>';

  renderMarkdownErrorCalled = false;
  renderMarkdownErrorValue?: unknown;
  renderMarkdownErrorReturnValue = '> **Error**';

  override validateParams(params: unknown): string | undefined {
    if (!this.hasValidateParams) return undefined;
    return this.validateParamsResult;
  }

  async getData(args: { params: unknown; signal?: AbortSignal; context?: ComponentContext }) {
    this.getDataCalled = true;
    this.getDataParams = args.params;
    this.getDataSignal = args.signal;
    this.getDataContext = args.context;

    if (this.getDataReturnValue instanceof Error) {
      throw this.getDataReturnValue;
    }

    return this.getDataReturnValue;
  }

  renderMarkdown(args: { data: unknown; params: unknown; context?: ComponentContext }): string {
    this.renderMarkdownCalled = true;
    this.renderMarkdownData = args.data;
    this.renderMarkdownParams = args.params;
    this.renderMarkdownContext = args.context;
    return this.renderMarkdownReturnValue;
  }

  override renderHTML(
    args: { data: unknown; params: unknown; context?: ComponentContext },
  ): string {
    this.renderHTMLCalled = true;
    this.renderHTMLData = args.data;
    this.renderHTMLParams = args.params;
    this.renderHTMLContext = args.context;
    return this.renderHTMLReturnValue;
  }

  override renderError(args: { error: unknown; params: unknown }): string {
    this.renderErrorCalled = true;
    this.renderErrorValue = args.error;
    this.renderErrorParams = args.params;
    return this.renderErrorReturnValue;
  }

  override renderMarkdownError(error: unknown): string {
    this.renderMarkdownErrorCalled = true;
    this.renderMarkdownErrorValue = error;
    return this.renderMarkdownErrorReturnValue;
  }
}

// ============================================================================
// renderComponent() - Basic Lifecycle Tests
// ============================================================================

Deno.test('renderComponent - HTML context: calls getData then renderHTML', async () => {
  const component = new MockComponent();
  const params = { id: '123' };
  const context = createMockContext();

  const result = await renderComponent(component, params, 'html', {
    componentContext: context,
  });

  assertEquals(component.getDataCalled, true);
  assertEquals(component.renderHTMLCalled, true);
  assertEquals(component.renderMarkdownCalled, false);
  assertEquals(result, '<div>Mock HTML</div>');
});

Deno.test('renderComponent - Markdown context: calls getData then renderMarkdown', async () => {
  const component = new MockComponent();
  const params = { id: '456' };
  const context = createMockContext();

  const result = await renderComponent(component, params, 'markdown', {
    componentContext: context,
  });

  assertEquals(component.getDataCalled, true);
  assertEquals(component.renderMarkdownCalled, true);
  assertEquals(component.renderHTMLCalled, false);
  assertEquals(result, '# Mock Markdown');
});

Deno.test('renderComponent - Passes params to getData', async () => {
  const component = new MockComponent();
  const params = { id: '789', name: 'test' };

  await renderComponent(component, params, 'html');

  assertEquals(component.getDataParams, params);
});

Deno.test('renderComponent - Passes context to getData', async () => {
  const component = new MockComponent();
  const context = createMockContext({ pathname: '/custom' });

  await renderComponent(component, {}, 'html', { componentContext: context });

  assertEquals(component.getDataContext, context);
});

Deno.test('renderComponent - Passes signal to getData', async () => {
  const component = new MockComponent();
  const controller = new AbortController();

  await renderComponent(component, {}, 'html', { signal: controller.signal });

  assertEquals(component.getDataSignal, controller.signal);
});

// ============================================================================
// renderComponent() - Data Passing to Render Functions
// ============================================================================

Deno.test('renderComponent - Passes getData result to renderHTML', async () => {
  const component = new MockComponent();
  component.getDataReturnValue = { title: 'Custom Data' };

  await renderComponent(component, {}, 'html');

  assertEquals(component.renderHTMLData, { title: 'Custom Data' });
});

Deno.test('renderComponent - Passes getData result to renderMarkdown', async () => {
  const component = new MockComponent();
  component.getDataReturnValue = { title: 'Custom Data' };

  await renderComponent(component, {}, 'markdown');

  assertEquals(component.renderMarkdownData, { title: 'Custom Data' });
});

Deno.test('renderComponent - Passes null data to render when getData returns null', async () => {
  const component = new MockComponent();
  component.getDataReturnValue = null;

  await renderComponent(component, {}, 'html');

  assertEquals(component.renderHTMLData, null);
});

Deno.test('renderComponent - HTML: passes params and context to renderHTML', async () => {
  const component = new MockComponent();
  const params = { slug: 'test-post' };
  const context = createMockContext();

  await renderComponent(component, params, 'html', { componentContext: context });

  assertEquals(component.renderHTMLParams, params);
  assertEquals(component.renderHTMLContext, context);
});

Deno.test('renderComponent - Markdown: passes params and context to renderMarkdown', async () => {
  const component = new MockComponent();
  const params = { slug: 'test-post' };
  const context = createMockContext();

  await renderComponent(component, params, 'markdown', { componentContext: context });

  assertEquals(component.renderMarkdownParams, params);
  assertEquals(component.renderMarkdownContext, context);
});

// ============================================================================
// renderComponent() - Params Validation
// ============================================================================

Deno.test('renderComponent - HTML: validation passes, continues to getData', async () => {
  const component = new MockComponent();
  component.validateParamsResult = undefined;

  const result = await renderComponent(component, { id: '1' }, 'html');

  assertEquals(component.getDataCalled, true);
  assertEquals(result, '<div>Mock HTML</div>');
});

Deno.test('renderComponent - Markdown: validation passes, continues to getData', async () => {
  const component = new MockComponent();
  component.validateParamsResult = undefined;

  const result = await renderComponent(component, { id: '1' }, 'markdown');

  assertEquals(component.getDataCalled, true);
  assertEquals(result, '# Mock Markdown');
});

Deno.test('renderComponent - HTML: validation fails, calls renderError', async () => {
  const component = new MockComponent();
  component.validateParamsResult = 'Invalid ID';

  const result = await renderComponent(component, { id: 'invalid' }, 'html');

  assertEquals(component.getDataCalled, false);
  assertEquals(component.renderHTMLCalled, false);
  assertEquals(component.renderErrorCalled, true);
  assertEquals(result, '<div class="c-error">Error</div>');
});

Deno.test('renderComponent - Markdown: validation fails, calls renderMarkdownError', async () => {
  const component = new MockComponent();
  component.validateParamsResult = 'Invalid ID';

  const result = await renderComponent(component, { id: 'invalid' }, 'markdown');

  assertEquals(component.getDataCalled, false);
  assertEquals(component.renderMarkdownCalled, false);
  assertEquals(component.renderMarkdownErrorCalled, true);
  assertEquals(result, '> **Error**');
});

Deno.test('renderComponent - Validation error passed to renderError with params', async () => {
  const component = new MockComponent();
  component.validateParamsResult = 'ID must be numeric';
  const params = { id: 'abc' };

  await renderComponent(component, params, 'html');

  assertEquals(component.renderErrorValue instanceof Error, true);
  assertEquals((component.renderErrorValue as Error).message, 'ID must be numeric');
  assertEquals(component.renderErrorParams, params);
});

Deno.test('renderComponent - No validateParams method: skips validation', async () => {
  const component = new MockComponent();
  component.hasValidateParams = false;

  const result = await renderComponent(component, { id: '1' }, 'html');

  assertEquals(component.getDataCalled, true);
  assertEquals(result, '<div>Mock HTML</div>');
});

// ============================================================================
// renderComponent() - Error Handling from getData
// ============================================================================

Deno.test('renderComponent - HTML: getData throws, calls renderError', async () => {
  const component = new MockComponent();
  const error = new Error('Data fetch failed');
  component.getDataReturnValue = error;

  const result = await renderComponent(component, {}, 'html');

  assertEquals(component.renderHTMLCalled, false);
  assertEquals(component.renderErrorCalled, true);
  assertEquals(component.renderErrorValue, error);
  assertEquals(result, '<div class="c-error">Error</div>');
});

Deno.test('renderComponent - Markdown: getData throws, calls renderMarkdownError', async () => {
  const component = new MockComponent();
  const error = new Error('Data fetch failed');
  component.getDataReturnValue = error;

  const result = await renderComponent(component, {}, 'markdown');

  assertEquals(component.renderMarkdownCalled, false);
  assertEquals(component.renderMarkdownErrorCalled, true);
  assertEquals(component.renderMarkdownErrorValue, error);
  assertEquals(result, '> **Error**');
});

Deno.test('renderComponent - getData error passed to renderError with params', async () => {
  const component = new MockComponent();
  const error = new Error('Network error');
  component.getDataReturnValue = error;
  const params = { id: '1' };

  await renderComponent(component, params, 'html');

  assertEquals(component.renderErrorParams, params);
});

// ============================================================================
// renderComponent() - Context Files Population
// ============================================================================

Deno.test('renderComponent - Passes context.files to component', async () => {
  const component = new MockComponent();
  const context = createMockContext({
    files: { html: '<p>test</p>', css: 'p { color: red; }' },
  });

  await renderComponent(component, {}, 'html', { componentContext: context });

  assertEquals(component.renderHTMLContext?.files?.html, '<p>test</p>');
  assertEquals(component.renderHTMLContext?.files?.css, 'p { color: red; }');
});

Deno.test('renderComponent - Markdown mode: passes context.files to renderMarkdown', async () => {
  const component = new MockComponent();
  const context = createMockContext({
    files: { md: '# Test' },
  });

  await renderComponent(component, {}, 'markdown', { componentContext: context });

  assertEquals(component.renderMarkdownContext?.files?.md, '# Test');
});

// ============================================================================
// renderComponent() - CSS Injection
// ============================================================================

Deno.test('renderComponent - CSS in context.files available to component', async () => {
  const component = new MockComponent();
  const cssContent = '.test { font-weight: bold; }';
  const context = createMockContext({
    files: { css: cssContent },
  });

  await renderComponent(component, {}, 'html', { componentContext: context });

  assertEquals(component.renderHTMLContext?.files?.css, cssContent);
});

// ============================================================================
// parseComponentBlocks() - Basic Parsing
// ============================================================================

Deno.test('parseComponentBlocks - Single component block with params', () => {
  const markdown = 'Text before\n```component:greeting\n{"name":"Alice"}\n```\nText after';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'greeting');
  assertEquals(blocks[0].params, { name: 'Alice' });
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseComponentBlocks - Single component block without params', () => {
  const markdown = 'Text\n```component:counter\n\n```\nMore text';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'counter');
  assertEquals(blocks[0].params, {});
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseComponentBlocks - Multiple component blocks', () => {
  const markdown = '```component:greeting\n{"name":"Alice"}\n```\n' +
    'Middle text\n' +
    '```component:counter\n{"start":5}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 2);
  assertEquals(blocks[0].componentName, 'greeting');
  assertEquals(blocks[1].componentName, 'counter');
});

Deno.test('parseComponentBlocks - Component name validation (kebab-case)', () => {
  const markdown1 = '```component:my-widget\n{}\n```';
  const markdown2 = '```component:widget123\n{}\n```';
  const markdown3 = '```component:w1-d2-g3\n{}\n```';

  const blocks1 = parseComponentBlocks(markdown1);
  const blocks2 = parseComponentBlocks(markdown2);
  const blocks3 = parseComponentBlocks(markdown3);

  assertEquals(blocks1[0].componentName, 'my-widget');
  assertEquals(blocks2[0].componentName, 'widget123');
  assertEquals(blocks3[0].componentName, 'w1-d2-g3');
});

// ============================================================================
// parseComponentBlocks() - Error Handling
// ============================================================================

Deno.test('parseComponentBlocks - Invalid JSON params', () => {
  const markdown = '```component:widget\n{invalid json}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'widget');
  assertEquals(blocks[0].params, null);
  assertStringIncludes(blocks[0].parseError!, 'Invalid JSON');
});

Deno.test('parseComponentBlocks - Params is array (invalid)', () => {
  const markdown = '```component:widget\n[1,2,3]\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseComponentBlocks - Params is null (invalid)', () => {
  const markdown = '```component:widget\nnull\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

Deno.test('parseComponentBlocks - Params is primitive (invalid)', () => {
  const markdown = '```component:widget\n"string"\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, null);
  assertEquals(blocks[0].parseError, 'Params must be a JSON object');
});

// ============================================================================
// parseComponentBlocks() - Index Tracking
// ============================================================================

Deno.test('parseComponentBlocks - Tracks startIndex and endIndex', () => {
  const prefix = 'Some text before\n';
  const block = '```component:widget\n{"x":1}\n```';
  const markdown = prefix + block;

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].startIndex, prefix.length);
  assertEquals(blocks[0].endIndex, markdown.length);
});

Deno.test('parseComponentBlocks - Multiple blocks track correct indices', () => {
  const markdown = '```component:a\n{}\n```\n' +
    'between\n' +
    '```component:b\n{}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 2);
  // First block
  assertEquals(blocks[0].startIndex, 0);
  assertEquals(blocks[0].endIndex > 0, true);
  // Second block starts after first
  assertEquals(blocks[1].startIndex > blocks[0].endIndex, true);
  assertEquals(blocks[1].endIndex > blocks[1].startIndex, true);
});

// ============================================================================
// parseComponentBlocks() - Edge Cases
// ============================================================================

Deno.test('parseComponentBlocks - No component blocks returns empty array', () => {
  const markdown = '# Heading\n\nSome text with no components';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 0);
});

Deno.test('parseComponentBlocks - Component block with whitespace in params', () => {
  const markdown = '```component:widget\n  { "key" : "value" }  \n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, { key: 'value' });
  assertEquals(blocks[0].parseError, undefined);
});

Deno.test('parseComponentBlocks - Component block with newlines in JSON', () => {
  const markdown = '```component:widget\n' +
    '{\n' +
    '  "name": "test",\n' +
    '  "value": 123\n' +
    '}\n' +
    '```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, { name: 'test', value: 123 });
});

Deno.test('parseComponentBlocks - Component name must start with lowercase', () => {
  const markdown1 = '```component:Widget\n{}\n```';
  const markdown2 = '```component:WIDGET\n{}\n```';

  const blocks1 = parseComponentBlocks(markdown1);
  const blocks2 = parseComponentBlocks(markdown2);

  // Pattern requires lowercase start [a-z], so these won't match
  assertEquals(blocks1.length, 0);
  assertEquals(blocks2.length, 0);
});

Deno.test('parseComponentBlocks - Complex nested JSON', () => {
  const markdown = '```component:widget\n{"user":{"name":"Alice","age":30},"tags":["a","b"]}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].params, {
    user: { name: 'Alice', age: 30 },
    tags: ['a', 'b'],
  });
});

Deno.test('parseComponentBlocks - Empty markdown', () => {
  const blocks = parseComponentBlocks('');

  assertEquals(blocks.length, 0);
});

// ============================================================================
// replaceComponentBlocks() - Basic Replacement
// ============================================================================

Deno.test('replaceComponentBlocks - Single block replacement', () => {
  const markdown = 'Before\n```component:widget\n{}\n```\nAfter';
  const block = parseComponentBlocks(markdown)[0];
  const replacements = new Map([[block, '<div>Rendered</div>']]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'Before\n<div>Rendered</div>\nAfter');
});

Deno.test('replaceComponentBlocks - Multiple block replacements', () => {
  const markdown = '```component:a\n{}\n```\n' +
    'middle\n' +
    '```component:b\n{}\n```';
  const blocks = parseComponentBlocks(markdown);
  const replacements = new Map([
    [blocks[0], '[A]'],
    [blocks[1], '[B]'],
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, '[A]\nmiddle\n[B]');
});

Deno.test('replaceComponentBlocks - Replacement with HTML', () => {
  const markdown = '```component:card\n{"title":"Test"}\n```';
  const block = parseComponentBlocks(markdown)[0];
  const replacements = new Map([[
    block,
    '<div class="card"><h2>Test</h2><p>Content</p></div>',
  ]]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, '<div class="card"><h2>Test</h2><p>Content</p></div>');
});

// ============================================================================
// replaceComponentBlocks() - Partial Replacements
// ============================================================================

Deno.test('replaceComponentBlocks - Only replace some blocks', () => {
  const markdown = '```component:a\n{}\n```\n' +
    '```component:b\n{}\n```\n' +
    '```component:c\n{}\n```';
  const blocks = parseComponentBlocks(markdown);
  const replacements = new Map([
    [blocks[0], 'A'],
    [blocks[2], 'C'],
    // blocks[1] not replaced
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'A\n```component:b\n{}\n```\nC');
});

Deno.test('replaceComponentBlocks - Empty replacements map', () => {
  const markdown = '```component:widget\n{}\n```';
  const replacements = new Map<ParsedComponentBlock, string>();

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, markdown);
});

// ============================================================================
// replaceComponentBlocks() - Order Independence
// ============================================================================

Deno.test('replaceComponentBlocks - Processes in reverse order for correct indices', () => {
  const markdown = 'a```component:x\n{}\n```b' +
    'c```component:y\n{}\n```d' +
    'e```component:z\n{}\n```f';
  const blocks = parseComponentBlocks(markdown);

  // Provide replacements in forward order
  const replacements = new Map([
    [blocks[0], 'X'],
    [blocks[1], 'Y'],
    [blocks[2], 'Z'],
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'aXbcYdeZf');
});

// ============================================================================
// Integration: Parsing and Replacement Together
// ============================================================================

Deno.test('Integration - Parse and replace component blocks', () => {
  const markdown = '# Page\n\n```component:greeting\n{"name":"Alice"}\n```\n\nEnd';

  const blocks = parseComponentBlocks(markdown);
  assertEquals(blocks.length, 1);
  assertEquals(blocks[0].componentName, 'greeting');

  const replacements = new Map([
    [blocks[0], '<div class="greeting"><p>Hello Alice!</p></div>'],
  ]);
  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(
    result,
    '# Page\n\n<div class="greeting"><p>Hello Alice!</p></div>\n\nEnd',
  );
});

Deno.test('Integration - Parse, render, and replace components', async () => {
  const markdown = '# Widget Demo\n\n```component:counter\n{"start":5}\n```\n\nDone';

  const blocks = parseComponentBlocks(markdown);
  assertEquals(blocks.length, 1);

  const component = new MockComponent();
  const context = createMockContext();
  const rendered = await renderComponent(component, blocks[0].params!, 'html', {
    componentContext: context,
  });

  const replacements = new Map([[blocks[0], rendered]]);
  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, '# Widget Demo\n\n<div>Mock HTML</div>\n\nDone');
});

// ============================================================================
// Abort Signal Handling
// ============================================================================

Deno.test('renderComponent - Passes AbortSignal through to getData', async () => {
  const component = new MockComponent();
  const controller = new AbortController();

  await renderComponent(component, {}, 'html', { signal: controller.signal });

  assertEquals(component.getDataSignal, controller.signal);
});

Deno.test('renderComponent - Can abort rendering', async () => {
  const component = new MockComponent();
  let receivedSignal: AbortSignal | undefined;

  component.getData = async (args) => {
    receivedSignal = args.signal;
    if (args.signal?.aborted) {
      throw new Error('Aborted');
    }
    return { data: 'test' };
  };

  const controller = new AbortController();
  controller.abort();

  await renderComponent(component, {}, 'html', { signal: controller.signal });

  assertEquals(receivedSignal?.aborted, true);
  assertEquals(component.renderErrorCalled, true);
});

// ============================================================================
// Component Without Optional Methods
// ============================================================================

Deno.test('renderComponent - Component without validateParams', async () => {
  const component = new MockComponent();
  // Remove validateParams
  component.validateParams = undefined as any;

  const result = await renderComponent(component, { id: '1' }, 'html');

  assertEquals(component.getDataCalled, true);
  assertEquals(result, '<div>Mock HTML</div>');
});

// ============================================================================
// Edge Cases & Special Scenarios
// ============================================================================

Deno.test('renderComponent - Empty params object', async () => {
  const component = new MockComponent();

  await renderComponent(component, {}, 'html');

  assertEquals(component.getDataParams, {});
  assertEquals(component.renderHTMLParams, {});
});

Deno.test('parseComponentBlocks - Multiple blocks with same name', () => {
  const markdown = '```component:widget\n{"id":1}\n```\n' +
    '```component:widget\n{"id":2}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks.length, 2);
  assertEquals(blocks[0].componentName, 'widget');
  assertEquals(blocks[1].componentName, 'widget');
  assertEquals(blocks[0].params, { id: 1 });
  assertEquals(blocks[1].params, { id: 2 });
});

Deno.test('parseComponentBlocks - fullMatch property correct', () => {
  const markdown = '```component:test\n{"x":1}\n```';

  const blocks = parseComponentBlocks(markdown);

  assertEquals(blocks[0].fullMatch, markdown);
});

Deno.test('replaceComponentBlocks - Replacement longer than original', () => {
  const markdown = 'a```component:x\n{}\n```b';
  const block = parseComponentBlocks(markdown)[0];
  const longReplacement = '<div class="card"><h1>Very Long Replacement Content</h1></div>';
  const replacements = new Map([[block, longReplacement]]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'a' + longReplacement + 'b');
});

Deno.test('replaceComponentBlocks - Replacement shorter than original', () => {
  const markdown = 'a```component:very-long-name\n{"very":"long","params":"here"}\n```b';
  const block = parseComponentBlocks(markdown)[0];
  const shortReplacement = 'X';
  const replacements = new Map([[block, shortReplacement]]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, 'aXb');
});

// ============================================================================
// Real-world Scenarios
// ============================================================================

Deno.test('Real world - Render page with multiple widgets', async () => {
  const markdown = '# My Page\n\n' +
    '```component:hero\n{"title":"Welcome"}\n```\n\n' +
    'Some content\n\n' +
    '```component:card-list\n{"count":3}\n```\n\n' +
    'More content';

  const blocks = parseComponentBlocks(markdown);
  assertEquals(blocks.length, 2);

  const component1 = new MockComponent();
  component1.renderHTMLReturnValue = '<section class="hero">Welcome</section>';

  const component2 = new MockComponent();
  component2.renderHTMLReturnValue = '<div class="cards">3 items</div>';

  const rendered1 = await renderComponent(component1, blocks[0].params!, 'html');
  const rendered2 = await renderComponent(component2, blocks[1].params!, 'html');

  const replacements = new Map([
    [blocks[0], rendered1],
    [blocks[1], rendered2],
  ]);

  const result = replaceComponentBlocks(markdown, replacements);

  assertStringIncludes(result, '<section class="hero">Welcome</section>');
  assertStringIncludes(result, '<div class="cards">3 items</div>');
  assertStringIncludes(result, '# My Page');
  assertStringIncludes(result, 'Some content');
});

Deno.test('Real world - Markdown rendering pipeline', async () => {
  const markdown = '# Article\n\n```component:preview\n{"draft":false}\n```';

  const blocks = parseComponentBlocks(markdown);
  const component = new MockComponent();
  component.renderMarkdownReturnValue = '> Article Preview';

  const rendered = await renderComponent(component, blocks[0].params!, 'markdown');

  const replacements = new Map([[blocks[0], rendered]]);
  const result = replaceComponentBlocks(markdown, replacements);

  assertEquals(result, '# Article\n\n> Article Preview');
});

Deno.test('Real world - Error recovery in component rendering', async () => {
  const markdown = '```component:api-widget\n{"endpoint":"/data"}\n```';

  const blocks = parseComponentBlocks(markdown);
  const component = new MockComponent();
  component.getDataReturnValue = new Error('API unavailable');
  component.renderErrorReturnValue = '<div class="error">Service unavailable</div>';

  const rendered = await renderComponent(component, blocks[0].params!, 'html');

  const replacements = new Map([[blocks[0], rendered]]);
  const result = replaceComponentBlocks(markdown, replacements);

  assertStringIncludes(result, '<div class="error">Service unavailable</div>');
});
