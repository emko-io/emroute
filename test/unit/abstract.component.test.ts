import { assert, assertEquals } from '@std/assert';
import {
  Component,
  ComponentManifestEntry,
  PageComponent,
  RenderContext,
} from '../../src/component/abstract.component.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Concrete implementation of Component for testing
 */
class TestComponent extends Component<{ title: string }, { content: string }> {
  readonly name = 'test-component';

  async getData(
    { params }: { params: { title: string }; signal?: AbortSignal },
  ): Promise<{ content: string }> {
    return { content: params.title };
  }

  renderMarkdown({ data }: { data: { content: string }; params: { title: string } }): string {
    return `# ${data.content}`;
  }
}

/**
 * Component with validateParams override
 */
class ValidatedComponent extends Component<{ required: string }, string> {
  readonly name = 'validated-component';

  override validateParams(params: { required: string }): string | undefined {
    if (!params.required || params.required.trim() === '') {
      return 'required field cannot be empty';
    }
    return undefined;
  }

  async getData(
    _args: { params: { required: string }; signal?: AbortSignal },
  ): Promise<string> {
    return 'test data';
  }

  renderMarkdown(_args: { data: string; params: { required: string } }): string {
    return 'test markdown';
  }
}

/**
 * Component with custom HTML rendering
 */
class CustomHTMLComponent extends Component<null, string> {
  readonly name = 'custom-html';

  async getData(
    _args: { params: null; signal?: AbortSignal },
  ): Promise<string> {
    return 'custom data';
  }

  renderMarkdown({ data }: { data: string; params: null }): string {
    return `markdown: ${data}`;
  }

  override renderHTML({ data }: { data: string | null; params: null }): string {
    if (data === null) {
      return '<div class="custom-loading">Custom Loading State</div>';
    }
    return `<div class="custom-html">${data}</div>`;
  }
}

/**
 * Concrete implementation of PageComponent for testing
 */
class TestPageComponent extends PageComponent<
  { id: string },
  { title: string }
> {
  override readonly name = 'test-page';
  override readonly pattern = '/posts/:id';

  override async getData(
    { params }: Parameters<PageComponent<{ id: string }, { title: string }>['getData']>[0],
  ): Promise<{ title: string }> {
    return { title: `Post ${params.id}` };
  }

  override renderMarkdown(
    { data }: Parameters<PageComponent<{ id: string }, { title: string }>['renderMarkdown']>[0],
  ): string {
    return `# ${data?.title}`;
  }
}

// ============================================================================
// Component Abstract Class Tests
// ============================================================================

Deno.test('Component - name property is abstract', () => {
  const component = new TestComponent();
  assertEquals(component.name, 'test-component');
});

Deno.test('Component - renderHTML with null data shows loading state', () => {
  const component = new TestComponent();
  const result = component.renderHTML({ data: null, params: { title: 'Test' } });
  assertEquals(
    result,
    '<div class="c-loading" data-component="test-component">Loading...</div>',
  );
});

Deno.test('Component - renderHTML with data wraps markdown in container', () => {
  const component = new TestComponent();
  const result = component.renderHTML({
    data: { content: 'Hello' },
    params: { title: 'Hello' },
  });
  assertEquals(
    result,
    '<div class="c-markdown" data-component="test-component" data-markdown># Hello</div>',
  );
});

Deno.test('Component - renderHTML escapes markdown output', () => {
  const component = new TestComponent();
  const result = component.renderHTML({
    data: { content: '<script>alert("xss")</script>' },
    params: { title: 'Test' },
  });
  assertEquals(
    result.includes('&lt;script&gt;'),
    true,
    'Should escape HTML special characters',
  );
  assertEquals(
    result.includes('<script>'),
    false,
    'Should not contain unescaped script tag',
  );
});

Deno.test('Component - renderHTML includes component name in data attribute', () => {
  const component = new TestComponent();
  const result = component.renderHTML({
    data: { content: 'test' },
    params: { title: 'test' },
  });
  assertEquals(result.includes('data-component="test-component"'), true);
});

Deno.test('Component - renderError with Error object', () => {
  const component = new TestComponent();
  const error = new Error('Database connection failed');
  const result = component.renderError({ error, params: { title: 'Test' } });
  assertEquals(
    result,
    '<div class="c-error" data-component="test-component">Error: Database connection failed</div>',
  );
});

Deno.test('Component - renderError with string', () => {
  const component = new TestComponent();
  const result = component.renderError({
    error: 'Something went wrong',
    params: { title: 'Test' },
  });
  assertEquals(
    result,
    '<div class="c-error" data-component="test-component">Error: Something went wrong</div>',
  );
});

Deno.test('Component - renderError with unknown object', () => {
  const component = new TestComponent();
  const result = component.renderError({ error: { foo: 'bar' }, params: { title: 'Test' } });
  assertEquals(
    result,
    '<div class="c-error" data-component="test-component">Error: [object Object]</div>',
  );
});

Deno.test('Component - renderError with number', () => {
  const component = new TestComponent();
  const result = component.renderError({ error: 404, params: { title: 'Test' } });
  assertEquals(
    result,
    '<div class="c-error" data-component="test-component">Error: 404</div>',
  );
});

Deno.test('Component - renderError escapes HTML in error message', () => {
  const component = new TestComponent();
  const error = new Error('Failed: <script>alert("xss")</script>');
  const result = component.renderError({ error, params: { title: 'Test' } });
  assertEquals(result.includes('&lt;script&gt;'), true);
  assertEquals(result.includes('<script>'), false);
});

Deno.test('Component - renderError with empty error message', () => {
  const component = new TestComponent();
  const error = new Error('');
  const result = component.renderError({ error, params: { title: 'Test' } });
  assertEquals(
    result,
    '<div class="c-error" data-component="test-component">Error: </div>',
  );
});

Deno.test('Component - renderMarkdownError with Error object', () => {
  const component = new TestComponent();
  const error = new Error('File not found');
  const result = component.renderMarkdownError(error);
  assertEquals(
    result,
    '> **Error** (`test-component`): File not found',
  );
});

Deno.test('Component - renderMarkdownError with string', () => {
  const component = new TestComponent();
  const result = component.renderMarkdownError('Invalid input');
  assertEquals(
    result,
    '> **Error** (`test-component`): Invalid input',
  );
});

Deno.test('Component - renderMarkdownError with object', () => {
  const component = new TestComponent();
  const result = component.renderMarkdownError({ code: 'ENOTFOUND' });
  assertEquals(
    result,
    '> **Error** (`test-component`): [object Object]',
  );
});

Deno.test('Component - renderMarkdownError with special characters in message', () => {
  const component = new TestComponent();
  const error = new Error('Error & failure with "quotes"');
  const result = component.renderMarkdownError(error);
  assertEquals(
    result,
    '> **Error** (`test-component`): Error & failure with "quotes"',
  );
});

Deno.test('Component - renderMarkdownError includes component name', () => {
  const component = new TestComponent();
  const result = component.renderMarkdownError(new Error('Test error'));
  assertEquals(result.includes('`test-component`'), true);
});

Deno.test('Component - validateParams is optional method', () => {
  const component = new TestComponent();
  assertEquals(component.validateParams === undefined, true);
});

Deno.test('Component - validateParams returns undefined when valid', () => {
  const component = new ValidatedComponent();
  const result = component.validateParams({ required: 'value' });
  assertEquals(result, undefined);
});

Deno.test('Component - validateParams returns error message when invalid', () => {
  const component = new ValidatedComponent();
  const result = component.validateParams({ required: '' });
  assertEquals(result, 'required field cannot be empty');
});

Deno.test('Component - getData is abstract and must be implemented', async () => {
  const component = new TestComponent();
  const data = await component.getData({ params: { title: 'Test' } });
  assertEquals(data, { content: 'Test' });
});

Deno.test('Component - renderMarkdown is abstract and must be implemented', () => {
  const component = new TestComponent();
  const result = component.renderMarkdown({ data: { content: 'Test' }, params: { title: 'Test' } });
  assertEquals(result, '# Test');
});

// ============================================================================
// Component Custom HTML Rendering Tests
// ============================================================================

Deno.test('Component - custom renderHTML override with null data', () => {
  const component = new CustomHTMLComponent();
  const result = component.renderHTML({ data: null, params: null });
  assertEquals(result, '<div class="custom-loading">Custom Loading State</div>');
});

Deno.test('Component - custom renderHTML override with data', () => {
  const component = new CustomHTMLComponent();
  const result = component.renderHTML({ data: 'content', params: null });
  assertEquals(result, '<div class="custom-html">content</div>');
});

// ============================================================================
// PageComponent Abstract Class Tests
// ============================================================================

Deno.test('PageComponent - extends Component properly', () => {
  const page = new TestPageComponent();
  assertEquals(page instanceof Component, true);
});

Deno.test('PageComponent - has name property', () => {
  const page = new TestPageComponent();
  assertEquals(page.name, 'test-page');
});

Deno.test('PageComponent - has pattern property', () => {
  const page = new TestPageComponent();
  assertEquals(page.pattern, '/posts/:id');
});

Deno.test('PageComponent - getData receives route params', async () => {
  const page = new TestPageComponent();
  const data = await page.getData({ params: { id: '123' } });
  assertEquals(data, { title: 'Post 123' });
});

Deno.test('PageComponent - renderMarkdown works with inherited method', () => {
  const page = new TestPageComponent();
  const result = page.renderMarkdown({ data: { title: 'My Post' }, params: { id: '1' } });
  assertEquals(result, '# My Post');
});

Deno.test('PageComponent - renderError inherited from Component', () => {
  const page = new TestPageComponent();
  const error = new Error('Page load failed');
  const result = page.renderError({ error, params: { id: '1' } });
  assertEquals(result.includes('Page load failed'), true);
});

Deno.test('PageComponent - renderMarkdownError inherited from Component', () => {
  const page = new TestPageComponent();
  const result = page.renderMarkdownError(new Error('Not found'));
  assertEquals(result.includes('test-page'), true);
});

Deno.test('PageComponent - renderHTML returns slot when no context files', () => {
  const page = new TestPageComponent();
  const result = page.renderHTML({ data: { title: 'Test' }, params: { id: '1' } });
  assertEquals(result.includes('router-slot'), true);
});

// ============================================================================
// RenderContext Type Tests
// ============================================================================

Deno.test('RenderContext - type includes markdown', () => {
  const context: RenderContext = 'markdown';
  assertEquals(context, 'markdown');
});

Deno.test('RenderContext - type includes html', () => {
  const context: RenderContext = 'html';
  assertEquals(context, 'html');
});

Deno.test('RenderContext - type includes spa', () => {
  const context: RenderContext = 'spa';
  assertEquals(context, 'spa');
});

// ============================================================================
// ComponentManifestEntry Interface Tests
// ============================================================================

Deno.test('ComponentManifestEntry - basic structure with required fields', () => {
  const entry: ComponentManifestEntry = {
    name: 'test-component',
    modulePath: './test.component.ts',
    tagName: 'c-test-component',
    type: 'widget',
  };
  assertEquals(entry.name, 'test-component');
  assertEquals(entry.modulePath, './test.component.ts');
  assertEquals(entry.tagName, 'c-test-component');
  assertEquals(entry.type, 'widget');
});

Deno.test('ComponentManifestEntry - with optional pattern field for pages', () => {
  const entry: ComponentManifestEntry = {
    name: 'posts-page',
    modulePath: './pages/posts.component.ts',
    tagName: 'c-posts-page',
    type: 'page',
    pattern: '/posts/:id',
  };
  assertEquals(entry.pattern, '/posts/:id');
});

Deno.test('ComponentManifestEntry - type can be page', () => {
  const entry: ComponentManifestEntry = {
    name: 'home-page',
    modulePath: './pages/home.component.ts',
    tagName: 'c-home-page',
    type: 'page',
  };
  assertEquals(entry.type, 'page');
});

Deno.test('ComponentManifestEntry - type can be widget', () => {
  const entry: ComponentManifestEntry = {
    name: 'counter-widget',
    modulePath: './widgets/counter.component.ts',
    tagName: 'c-counter-widget',
    type: 'widget',
  };
  assertEquals(entry.type, 'widget');
});

Deno.test('ComponentManifestEntry - name in kebab-case', () => {
  const entry: ComponentManifestEntry = {
    name: 'my-awesome-component',
    modulePath: './components/my-awesome.component.ts',
    tagName: 'c-my-awesome-component',
    type: 'widget',
  };
  assertEquals(entry.name, 'my-awesome-component');
});

Deno.test('ComponentManifestEntry - modulePath with relative path', () => {
  const entry: ComponentManifestEntry = {
    name: 'test',
    modulePath: '../../shared/components/test.component.ts',
    tagName: 'c-test',
    type: 'widget',
  };
  assertEquals(entry.modulePath, '../../shared/components/test.component.ts');
});

Deno.test('ComponentManifestEntry - tagName follows custom element conventions', () => {
  const entry: ComponentManifestEntry = {
    name: 'my-component',
    modulePath: './my.component.ts',
    tagName: 'c-my-component',
    type: 'widget',
  };
  assertEquals(entry.tagName.startsWith('c-'), true);
  assertEquals(entry.tagName.includes('-'), true);
});

// ============================================================================
// Edge Cases and Error Scenarios
// ============================================================================

Deno.test('Component - name with empty string fails type checking but stores empty', () => {
  class EmptyNameComponent extends Component<null, null> {
    readonly name = '';

    async getData(_args: { params: null; signal?: AbortSignal }): Promise<null> {
      return null;
    }

    renderMarkdown(_args: { data: null; params: null }): string {
      return '';
    }
  }

  const component = new EmptyNameComponent();
  assertEquals(component.name, '');
});

Deno.test('Component - renderHTML with complex HTML characters in data', () => {
  const component = new TestComponent();
  const result = component.renderHTML({
    data: { content: '& < > " \' characters' },
    params: { title: 'Test' },
  });
  assertEquals(result.includes('&amp;'), true);
  assertEquals(result.includes('&lt;'), true);
  assertEquals(result.includes('&gt;'), true);
  assertEquals(result.includes('&quot;'), true);
});

Deno.test('Component - renderError with very long error message', () => {
  const component = new TestComponent();
  const longMessage = 'x'.repeat(1000);
  const error = new Error(longMessage);
  const result = component.renderError({ error, params: { title: 'Test' } });
  assertEquals(result.includes(longMessage), true);
});

Deno.test('Component - renderError with null passed as unknown', () => {
  const component = new TestComponent();
  const result = component.renderError({ error: null, params: { title: 'Test' } });
  assertEquals(result.includes('null'), true);
});

Deno.test('Component - renderError with undefined', () => {
  const component = new TestComponent();
  const result = component.renderError({ error: undefined, params: { title: 'Test' } });
  assertEquals(result.includes('undefined'), true);
});

Deno.test('Component - renderMarkdownError with null', () => {
  const component = new TestComponent();
  const result = component.renderMarkdownError(null);
  assertEquals(result.includes('null'), true);
});

Deno.test('Component - renderMarkdownError with undefined', () => {
  const component = new TestComponent();
  const result = component.renderMarkdownError(undefined);
  assertEquals(result.includes('undefined'), true);
});

Deno.test('Component - renderMarkdownError with boolean', () => {
  const component = new TestComponent();
  const result = component.renderMarkdownError(true);
  assertEquals(result.includes('true'), true);
});

Deno.test('Component - renderMarkdownError with array', () => {
  const component = new TestComponent();
  const result = component.renderMarkdownError(['error', 'details']);
  assertEquals(result.includes('error,details'), true);
});

Deno.test('Component - renderHTML data attribute preserved exactly', () => {
  const component = new TestComponent();
  const result = component.renderHTML({ data: { content: 'test' }, params: { title: 'test' } });
  assertEquals(result.includes('data-component="test-component"'), true);
  assertEquals(result.includes('data-markdown'), true);
});

Deno.test('PageComponent - pattern with complex route segments', () => {
  class ComplexPageComponent extends PageComponent<
    Record<string, string>,
    unknown
  > {
    override readonly name = 'complex-page';
    override readonly pattern = '/api/v1/users/:id/posts/:postId/comments/:commentId';

    override async getData(
      _args: Parameters<PageComponent['getData']>[0],
    ): Promise<unknown> {
      return {};
    }

    override renderMarkdown(_args: Parameters<PageComponent['renderMarkdown']>[0]): string {
      return '';
    }
  }

  const page = new ComplexPageComponent();
  assertEquals(
    page.pattern,
    '/api/v1/users/:id/posts/:postId/comments/:commentId',
  );
});

Deno.test('Component - renderHTML called with null multiple times', () => {
  const component = new TestComponent();
  const result1 = component.renderHTML({ data: null, params: { title: 'Test' } });
  const result2 = component.renderHTML({ data: null, params: { title: 'Test' } });
  assertEquals(result1, result2);
});

Deno.test('Component - renderError called multiple times returns consistent result', () => {
  const component = new TestComponent();
  const error = new Error('Consistent error');
  const result1 = component.renderError({ error, params: { title: 'Test' } });
  const result2 = component.renderError({ error, params: { title: 'Test' } });
  assertEquals(result1, result2);
});

Deno.test('ComponentManifestEntry - pattern is optional and omittable', () => {
  const entryWithoutPattern: ComponentManifestEntry = {
    name: 'widget',
    modulePath: './widget.ts',
    tagName: 'c-widget',
    type: 'widget',
  };
  assertEquals(entryWithoutPattern.pattern, undefined);
});

Deno.test('ComponentManifestEntry - all fields are required except pattern', () => {
  const entry: ComponentManifestEntry = {
    name: 'test',
    modulePath: './test.ts',
    tagName: 'c-test',
    type: 'page',
  };
  assertEquals(entry.name !== undefined, true);
  assertEquals(entry.modulePath !== undefined, true);
  assertEquals(entry.tagName !== undefined, true);
  assertEquals(entry.type !== undefined, true);
});

// ============================================================================
// Widget Tests
// ============================================================================

class TestWidget extends WidgetComponent<{ query: string }, { result: string }> {
  readonly name = 'test-widget';

  async getData(
    { params }: { params: { query: string }; signal?: AbortSignal },
  ): Promise<{ result: string }> {
    return { result: `Result for ${params.query}` };
  }

  override renderMarkdown({ data }: { data: { result: string }; params: { query: string } }): string {
    return `**${data.result}**`;
  }
}

Deno.test('Widget - extends Component', () => {
  const widget = new TestWidget();
  assertEquals(widget instanceof Component, true);
  assertEquals(widget instanceof WidgetComponent, true);
});

Deno.test('Widget - has name property', () => {
  const widget = new TestWidget();
  assertEquals(widget.name, 'test-widget');
});

Deno.test('Widget - extends Component', () => {
  const widget = new TestWidget();
  assert(widget instanceof WidgetComponent);
});

Deno.test('Widget - getData works', async () => {
  const widget = new TestWidget();
  const data = await widget.getData({ params: { query: 'test' } });
  assertEquals(data, { result: 'Result for test' });
});

Deno.test('Widget - renderMarkdown works', () => {
  const widget = new TestWidget();
  const result = widget.renderMarkdown({ data: { result: 'hello' }, params: { query: 'test' } });
  assertEquals(result, '**hello**');
});

Deno.test('Widget - inherits renderHTML from Component', () => {
  const widget = new TestWidget();
  const loading = widget.renderHTML({ data: null, params: { query: 'test' } });
  assertEquals(loading.includes('c-loading'), true);

  const ready = widget.renderHTML({ data: { result: 'done' }, params: { query: 'test' } });
  assertEquals(ready.includes('data-markdown'), true);
});

Deno.test('Widget - inherits renderError from Component', () => {
  const widget = new TestWidget();
  const result = widget.renderError({ error: new Error('fail'), params: { query: 'test' } });
  assertEquals(result.includes('c-error'), true);
  assertEquals(result.includes('fail'), true);
});

Deno.test('Widget - inherits renderMarkdownError from Component', () => {
  const widget = new TestWidget();
  const result = widget.renderMarkdownError(new Error('not found'));
  assertEquals(result.includes('test-widget'), true);
  assertEquals(result.includes('not found'), true);
});
