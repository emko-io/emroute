/**
 * Unit tests for Component (abstract.component.ts)
 *
 * Tests cover the abstract Component base class lifecycle and contract:
 * - Abstract method contracts (getData, renderMarkdown, renderHTML)
 * - Optional lifecycle hooks (validateParams, destroy)
 * - Error rendering (renderError, renderMarkdownError)
 * - Generic type parameters (TParams, TData, TContext)
 * - ComponentContext handling with files and abort signals
 * - Default implementations and fallback behavior
 * - HTML escaping for security
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';
import { Component, CSS_ERROR } from '../../src/component/abstract.component.ts';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

/**
 * Create a mock ComponentContext with optional overrides
 */
function createMockContext<T extends ComponentContext = ComponentContext>(
  overrides?: Partial<T>,
): T {
  return {
    pathname: '/test',
    pattern: '/test',
    params: {},
    searchParams: new URLSearchParams(),
    ...overrides,
  } as T;
}

/**
 * Minimal concrete component implementation for testing
 */
class TestComponent extends Component<{ id: string }, { name: string }> {
  override readonly name = 'test-component';

  override async getData(args: this['DataArgs']): Promise<{ name: string } | null> {
    if (args.params.id === 'error') {
      return null;
    }
    return { name: `Item ${args.params.id}` };
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    if (args.data === null) {
      return '# Loading...';
    }
    return `# ${args.data.name}`;
  }
}

/**
 * Component with custom renderHTML override
 */
class CustomHtmlComponent extends Component<{ id: string }, { content: string }> {
  override readonly name = 'custom-html';

  override async getData(args: this['DataArgs']): Promise<{ content: string } | null> {
    return { content: `Content for ${args.params.id}` };
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    return args.data?.content ?? 'No content';
  }

  override renderHTML(args: this['RenderArgs']): string {
    if (args.data === null) {
      return '<div class="custom-loading">Custom Loading...</div>';
    }
    return `<custom-wrapper>${args.data.content}</custom-wrapper>`;
  }
}

/**
 * Component with validation and custom destroy
 */
class ValidatingComponent extends Component<
  { id: string },
  { value: number }
> {
  override readonly name = 'validating';
  destroyCalled = false;

  override async getData(args: this['DataArgs']): Promise<
    {
      value: number;
    } | null
  > {
    return { value: parseInt(args.params.id, 10) };
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    return `## Value: ${args.data?.value ?? 'N/A'}`;
  }

  override validateParams(params: { id: string }): string | undefined {
    if (!params.id) {
      return 'ID is required';
    }
    if (isNaN(parseInt(params.id, 10))) {
      return 'ID must be a number';
    }
    return undefined;
  }

  override destroy(): void {
    this.destroyCalled = true;
  }
}

/**
 * Component with extended context type
 */
interface AppContext extends ComponentContext {
  readonly userId?: string;
  readonly isAdmin?: boolean;
}

class ContextAwareComponent extends Component<
  { id: string },
  { userId?: string; isAdmin?: boolean },
  AppContext
> {
  override readonly name = 'context-aware';

  override async getData(args: this['DataArgs']): Promise<
    {
      userId?: string;
      isAdmin?: boolean;
    } | null
  > {
    const context = args.context as AppContext;
    return {
      userId: context?.userId,
      isAdmin: context?.isAdmin,
    };
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    const data = args.data;
    return `User ID: ${data?.userId}, Admin: ${data?.isAdmin}`;
  }
}

// ============================================================================
// Component Name Tests
// ============================================================================

Deno.test('Component - name property identifies the component', () => {
  const component = new TestComponent();
  assertEquals(component.name, 'test-component');
});

Deno.test('Component - different components have different names', () => {
  const testComp = new TestComponent();
  const customComp = new CustomHtmlComponent();
  const validatingComp = new ValidatingComponent();

  assertEquals(testComp.name, 'test-component');
  assertEquals(customComp.name, 'custom-html');
  assertEquals(validatingComp.name, 'validating');
});

// ============================================================================
// getData() Abstract Method Tests
// ============================================================================

Deno.test('Component - getData() must be implemented by subclass', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: '123' },
  });

  assertEquals(data, { name: 'Item 123' });
});

Deno.test('Component - getData() receives params', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: 'custom-id' },
  });

  assertStringIncludes(data?.name || '', 'custom-id');
});

Deno.test('Component - getData() can return null for loading/missing states', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: 'error' },
  });

  assertEquals(data, null);
});

Deno.test('Component - getData() receives abort signal', async () => {
  const controller = new AbortController();
  const component = new TestComponent();

  const data = await component.getData({
    params: { id: '123' },
    signal: controller.signal,
  });

  assertEquals(data, { name: 'Item 123' });
});

Deno.test('Component - getData() receives context', async () => {
  const component = new ContextAwareComponent();
  const context = createMockContext<AppContext>({
    userId: 'user-1',
    isAdmin: true,
  });

  const data = await component.getData({
    params: { id: '123' },
    context,
  });

  assertEquals(data?.userId, 'user-1');
  assertEquals(data?.isAdmin, true);
});

// ============================================================================
// renderMarkdown() Abstract Method Tests
// ============================================================================

Deno.test('Component - renderMarkdown() must be implemented by subclass', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Test Item' },
    params: { id: '123' },
  });

  assertStringIncludes(markdown, 'Test Item');
});

Deno.test('Component - renderMarkdown() receives data', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Custom Name' },
    params: { id: '123' },
  });

  assertEquals(markdown, '# Custom Name');
});

Deno.test('Component - renderMarkdown() handles null data', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: null,
    params: { id: '123' },
  });

  assertEquals(markdown, '# Loading...');
});

Deno.test('Component - renderMarkdown() receives params', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Item' },
    params: { id: 'special-id' },
  });

  assertStringIncludes(markdown, 'Item');
});

Deno.test('Component - renderMarkdown() receives context', () => {
  const component = new ContextAwareComponent();
  const context = createMockContext<AppContext>({ userId: 'u123' });

  const markdown = component.renderMarkdown({
    data: { userId: 'u123' },
    params: { id: '1' },
    context,
  });

  assertStringIncludes(markdown, 'u123');
});

// ============================================================================
// renderHTML() Default Implementation Tests
// ============================================================================

Deno.test('Component - renderHTML() default: returns loading state when data is null', () => {
  const component = new TestComponent();
  const html = component.renderHTML({
    data: null,
    params: { id: '123' },
  });

  assertStringIncludes(html, 'Loading...');
  assertStringIncludes(html, 'c-loading');
  assertStringIncludes(html, 'data-component="test-component"');
});

Deno.test('Component - renderHTML() default: wraps markdown in container', () => {
  const component = new TestComponent();
  const html = component.renderHTML({
    data: { name: 'Test Content' },
    params: { id: '123' },
  });

  assertStringIncludes(html, 'c-markdown');
  assertStringIncludes(html, 'data-component="test-component"');
  assertStringIncludes(html, 'data-markdown');
});

Deno.test('Component - renderHTML() default: escapes markdown content for HTML safety', () => {
  class EscapeTestComponent extends Component<unknown, { content: string }> {
    override readonly name = 'escape-test';

    override async getData(): Promise<{ content: string } | null> {
      return { content: '<script>alert("xss")</script>' };
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return `# ${args.data?.content}`;
    }
  }

  const component = new EscapeTestComponent();
  const html = component.renderHTML({
    data: { content: '<script>alert("xss")</script>' },
    params: {},
  });

  assertEquals(html.includes('<script>'), false);
  assertStringIncludes(html, '&lt;script&gt;');
});

Deno.test('Component - renderHTML() can be overridden for custom HTML', () => {
  const component = new CustomHtmlComponent();
  const html = component.renderHTML({
    data: { content: 'Custom Content' },
    params: { id: '123' },
  });

  assertEquals(html, '<custom-wrapper>Custom Content</custom-wrapper>');
  assertEquals(html.includes('c-markdown'), false);
});

Deno.test('Component - renderHTML() custom: can have custom loading state', () => {
  const component = new CustomHtmlComponent();
  const html = component.renderHTML({
    data: null,
    params: { id: '123' },
  });

  assertStringIncludes(html, 'custom-loading');
  assertEquals(html.includes('c-loading'), false);
});

// ============================================================================
// renderError() Method Tests
// ============================================================================

Deno.test('Component - renderError() formats Error objects', () => {
  const component = new TestComponent();
  const error = new Error('Something went wrong');
  const html = component.renderError({
    error,
    params: { id: '123' },
  });

  assertStringIncludes(html, 'Something went wrong');
  assertStringIncludes(html, CSS_ERROR);
  assertStringIncludes(html, 'data-component="test-component"');
});

Deno.test('Component - renderError() handles non-Error objects', () => {
  const component = new TestComponent();
  const html = component.renderError({
    error: 'String error message',
    params: { id: '123' },
  });

  assertStringIncludes(html, 'String error message');
  assertStringIncludes(html, CSS_ERROR);
});

Deno.test('Component - renderError() handles unknown error types', () => {
  const component = new TestComponent();
  const html = component.renderError({
    error: { message: 'Object error' },
    params: { id: '123' },
  });

  assertStringIncludes(html, '[object Object]');
  assertStringIncludes(html, CSS_ERROR);
});

Deno.test('Component - renderError() escapes error messages for HTML safety', () => {
  const component = new TestComponent();
  const error = new Error('<script>alert("xss")</script>');
  const html = component.renderError({
    error,
    params: { id: '123' },
  });

  assertEquals(html.includes('<script>'), false);
  assertStringIncludes(html, '&lt;script&gt;');
});

Deno.test('Component - renderError() includes component name in output', () => {
  const customComp = new CustomHtmlComponent();
  const error = new Error('Test error');
  const html = customComp.renderError({
    error,
    params: { id: '123' },
  });

  assertStringIncludes(html, 'data-component="custom-html"');
});

// ============================================================================
// renderMarkdownError() Method Tests
// ============================================================================

Deno.test('Component - renderMarkdownError() formats Error objects', () => {
  const component = new TestComponent();
  const error = new Error('Markdown error');
  const markdown = component.renderMarkdownError(error);

  assertStringIncludes(markdown, 'Markdown error');
  assertStringIncludes(markdown, 'test-component');
});

Deno.test('Component - renderMarkdownError() handles non-Error objects', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdownError('String error');

  assertStringIncludes(markdown, 'String error');
  assertStringIncludes(markdown, '`test-component`');
});

Deno.test('Component - renderMarkdownError() includes component name', () => {
  const component = new ValidatingComponent();
  const error = new Error('Validation failed');
  const markdown = component.renderMarkdownError(error);

  assertStringIncludes(markdown, '`validating`');
});

// ============================================================================
// validateParams() Optional Method Tests
// ============================================================================

Deno.test('Component - validateParams() is optional and undefined by default', () => {
  const component = new TestComponent();
  const validate = component.validateParams;

  assertEquals(typeof validate, 'undefined');
});

Deno.test('Component - validateParams() can be implemented', () => {
  const component = new ValidatingComponent();
  const result = component.validateParams({ id: '123' });

  assertEquals(result, undefined);
});

Deno.test('Component - validateParams() returns error message on validation failure', () => {
  const component = new ValidatingComponent();
  const result = component.validateParams({ id: '' });

  assertEquals(result, 'ID is required');
});

Deno.test('Component - validateParams() validates param types', () => {
  const component = new ValidatingComponent();
  const result = component.validateParams({ id: 'not-a-number' });

  assertEquals(result, 'ID must be a number');
});

Deno.test('Component - validateParams() returns undefined for valid params', () => {
  const component = new ValidatingComponent();
  const validResult = component.validateParams({ id: '42' });

  assertEquals(validResult, undefined);
});

// ============================================================================
// destroy() Optional Lifecycle Hook Tests
// ============================================================================

Deno.test('Component - destroy() is optional and not called by default', () => {
  const component = new TestComponent();
  const destroy = component.destroy;

  assertEquals(typeof destroy, 'undefined');
});

Deno.test('Component - destroy() can be implemented for cleanup', () => {
  const component = new ValidatingComponent();

  // Verify destroy was not called yet
  assertEquals(component.destroyCalled, false);

  // Call destroy
  component.destroy?.();

  // Verify destroy was called
  assertEquals(component.destroyCalled, true);
});

Deno.test('Component - destroy() can clear resources', () => {
  class ResourceComponent extends Component<unknown, unknown> {
    override readonly name = 'resource';
    listeners: (() => void)[] = [];

    override async getData(): Promise<null> {
      return null;
    }

    override renderMarkdown(): string {
      return 'Resource component';
    }

    addListener(listener: () => void): void {
      this.listeners.push(listener);
    }

    override destroy(): void {
      this.listeners.length = 0;
    }
  }

  const component = new ResourceComponent();
  component.addListener(() => {});
  component.addListener(() => {});

  assertEquals(component.listeners.length, 2);

  component.destroy();

  assertEquals(component.listeners.length, 0);
});

// ============================================================================
// Generic Type Parameters Tests
// ============================================================================

Deno.test('Component - Generic TParams is used in getData', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: '456' },
  });

  assertStringIncludes(data?.name || '', '456');
});

Deno.test('Component - Generic TData is used in renderMarkdown', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Typed Data' },
    params: { id: '1' },
  });

  assertStringIncludes(markdown, 'Typed Data');
});

Deno.test('Component - Generic TContext extends ComponentContext', () => {
  const component = new ContextAwareComponent();
  const context = createMockContext<AppContext>({
    userId: 'test-user',
    isAdmin: true,
  });

  const data = component.renderMarkdown({
    data: { userId: 'test-user', isAdmin: true },
    params: { id: '1' },
    context,
  });

  assertStringIncludes(data, 'test-user');
});

// ============================================================================
// ComponentContext Tests
// ============================================================================

Deno.test('Component - ComponentContext includes route info', () => {
  const context = createMockContext({
    pathname: '/projects/123',
    pattern: '/projects/:id',
    params: { id: '123' },
  });

  assertEquals(context.pathname, '/projects/123');
  assertEquals(context.pattern, '/projects/:id');
  assertEquals(context.params.id, '123');
});

Deno.test('Component - ComponentContext includes search params', () => {
  const searchParams = new URLSearchParams('sort=date&filter=active');
  const context = createMockContext({ searchParams });

  assertEquals(context.searchParams.get('sort'), 'date');
  assertEquals(context.searchParams.get('filter'), 'active');
});

Deno.test('Component - ComponentContext can include file content', () => {
  const context = createMockContext({
    files: {
      html: '<div>HTML</div>',
      md: '# Markdown',
      css: '.class { color: red; }',
    },
  });

  assertExists(context.files);
  assertEquals(context.files!.html, '<div>HTML</div>');
  assertEquals(context.files!.md, '# Markdown');
  assertEquals(context.files!.css, '.class { color: red; }');
});

Deno.test('Component - ComponentContext can include abort signal', () => {
  const controller = new AbortController();
  const context = createMockContext({
    signal: controller.signal,
  });

  assertExists(context.signal);
  assertEquals(context.signal!.aborted, false);
});

Deno.test('Component - ComponentContext signal can be used for request cancellation', () => {
  const controller = new AbortController();
  const context = createMockContext({
    signal: controller.signal,
  });

  assertEquals(context.signal!.aborted, false);
  controller.abort();
  assertEquals(context.signal!.aborted, true);
});

// ============================================================================
// Element Reference Tests
// ============================================================================

Deno.test('Component - element property is optional and undefined by default', () => {
  const component = new TestComponent();

  assertEquals(component.element, undefined);
});

// ============================================================================
// Files Property Tests
// ============================================================================

Deno.test('Component - files property is optional', () => {
  const component = new TestComponent();

  assertEquals(component.files, undefined);
});

Deno.test('Component - files property can contain file content', () => {
  // Create a component with files via constructor/initialization
  class ComponentWithFiles extends Component<unknown, unknown> {
    override readonly name = 'with-files';
    override readonly files = {
      html: '<div>Content</div>',
      md: '# Content',
      css: '.style {}',
    };

    override async getData(): Promise<null> {
      return null;
    }

    override renderMarkdown(): string {
      return 'Content';
    }
  }

  const component = new ComponentWithFiles();

  assertEquals(component.files?.html, '<div>Content</div>');
  assertEquals(component.files?.md, '# Content');
  assertEquals(component.files?.css, '.style {}');
});

// ============================================================================
// Type Carrier Tests (DataArgs and RenderArgs)
// ============================================================================

Deno.test('Component - DataArgs type carrier provides correct type hints', async () => {
  const component = new TestComponent();

  // This test verifies the type system works
  // The DataArgs type should have params, signal, and context
  const args: typeof component['DataArgs'] = {
    params: { id: 'test' },
    signal: new AbortController().signal,
    context: createMockContext(),
  };

  const data = await component.getData(args);
  assertStringIncludes(data?.name || '', 'test');
});

Deno.test('Component - RenderArgs type carrier provides correct type hints', () => {
  const component = new TestComponent();

  // This test verifies the RenderArgs type system
  const args: typeof component['RenderArgs'] = {
    data: { name: 'Test' },
    params: { id: 'test' },
    context: createMockContext(),
  };

  const markdown = component.renderMarkdown(args);
  assertStringIncludes(markdown, 'Test');
});

// ============================================================================
// Integration & Contract Tests
// ============================================================================

Deno.test('Component - contract: getData → renderMarkdown pipeline works', async () => {
  const component = new TestComponent();

  // Get data
  const data = await component.getData({
    params: { id: 'integration' },
  });

  // Render markdown with that data
  const markdown = component.renderMarkdown({
    data,
    params: { id: 'integration' },
  });

  assertStringIncludes(markdown, 'integration');
});

Deno.test('Component - contract: getData → renderHTML pipeline works', async () => {
  const component = new TestComponent();

  // Get data
  const data = await component.getData({
    params: { id: 'html-test' },
  });

  // Render HTML with that data
  const html = component.renderHTML({
    data,
    params: { id: 'html-test' },
  });

  assertStringIncludes(html, 'c-markdown');
});

Deno.test('Component - contract: null data flows through pipeline', async () => {
  const component = new TestComponent();

  // Get null data
  const data = await component.getData({
    params: { id: 'error' },
  });

  assertEquals(data, null);

  // Render markdown with null
  const markdown = component.renderMarkdown({
    data,
    params: { id: 'error' },
  });

  assertStringIncludes(markdown, 'Loading');

  // Render HTML with null
  const html = component.renderHTML({
    data,
    params: { id: 'error' },
  });

  assertStringIncludes(html, 'Loading');
});

Deno.test('Component - contract: error handling flow', () => {
  const component = new TestComponent();
  const error = new Error('Test error');

  // renderError for HTML
  const htmlError = component.renderError({
    error,
    params: { id: '123' },
  });

  assertStringIncludes(htmlError, 'Test error');
  assertStringIncludes(htmlError, CSS_ERROR);

  // renderMarkdownError for markdown
  const mdError = component.renderMarkdownError(error);

  assertStringIncludes(mdError, 'Test error');
  assertStringIncludes(mdError, 'test-component');
});

// ============================================================================
// Type Safety & Polymorphism Tests
// ============================================================================

Deno.test('Component - subclasses can have different TParams types', async () => {
  class StringParamComponent extends Component<{ query: string }, unknown> {
    override readonly name = 'string-params';

    override async getData(args: this['DataArgs']): Promise<null> {
      return null;
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return `Query: ${args.params.query}`;
    }
  }

  class NumberParamComponent extends Component<{ id: number }, unknown> {
    override readonly name = 'number-params';

    override async getData(args: this['DataArgs']): Promise<null> {
      return null;
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return `ID: ${args.params.id}`;
    }
  }

  const stringComp = new StringParamComponent();
  const numComp = new NumberParamComponent();

  const strMd = stringComp.renderMarkdown({
    data: null,
    params: { query: 'search' },
  });

  const numMd = numComp.renderMarkdown({
    data: null,
    params: { id: 42 },
  });

  assertStringIncludes(strMd, 'search');
  assertStringIncludes(numMd, '42');
});

Deno.test('Component - subclasses can have different TData types', () => {
  class UserData extends Component<unknown, { userId: string; name: string }> {
    override readonly name = 'user-data';

    override async getData(): Promise<{ userId: string; name: string } | null> {
      return null;
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return args.data?.name ?? 'Unknown';
    }
  }

  class PostData extends Component<unknown, { title: string; body: string }> {
    override readonly name = 'post-data';

    override async getData(): Promise<{ title: string; body: string } | null> {
      return null;
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return args.data?.title ?? 'Untitled';
    }
  }

  const userComp = new UserData();
  const postComp = new PostData();

  const userMd = userComp.renderMarkdown({
    data: { userId: 'u1', name: 'Alice' },
    params: {},
  });

  const postMd = postComp.renderMarkdown({
    data: { title: 'My Post', body: 'Content' },
    params: {},
  });

  assertStringIncludes(userMd, 'Alice');
  assertStringIncludes(postMd, 'My Post');
});

Deno.test('Component - subclasses can extend ComponentContext with custom properties', () => {
  interface CustomContext extends ComponentContext {
    readonly userId: string;
    readonly permissions: string[];
  }

  class PermissionAwareComponent extends Component<
    unknown,
    { allowed: boolean },
    CustomContext
  > {
    override readonly name = 'permission-aware';

    override async getData(args: this['DataArgs']): Promise<
      {
        allowed: boolean;
      } | null
    > {
      const context = args.context as CustomContext;
      const allowed = context?.permissions.includes('edit') ?? false;
      return { allowed };
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return args.data?.allowed ? 'Edit allowed' : 'Edit denied';
    }
  }

  const component = new PermissionAwareComponent();
  const context = createMockContext<CustomContext>({
    userId: 'admin-1',
    permissions: ['read', 'edit', 'delete'],
  });

  // Component can access custom context properties
  const markdown = component.renderMarkdown({
    data: { allowed: true },
    params: {},
    context,
  });

  assertStringIncludes(markdown, 'Edit allowed');
});
