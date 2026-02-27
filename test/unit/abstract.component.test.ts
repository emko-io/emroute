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

import { test, expect, describe } from 'bun:test';
import type { ComponentContext } from '../../src/component/abstract.component.ts';
import { Component } from '../../src/component/abstract.component.ts';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

/**
 * Create a mock ComponentContext with optional overrides
 */
function createMockContext<T extends ComponentContext = ComponentContext>(
  overrides?: Partial<T>,
): T {
  const url = new URL('/test', 'http://test');
  return {
    url,
    pathname: url.pathname,
    params: {},
    searchParams: url.searchParams,
    ...overrides,
  } as T;
}

/**
 * Minimal concrete component implementation for testing
 */
class TestComponent extends Component<{ id: string }, { name: string }> {
  override readonly name = 'test-component';

  override getData(args: this['DataArgs']): Promise<{ name: string } | null> {
    if (args.params.id === 'error') {
      return Promise.resolve(null);
    }
    return Promise.resolve({ name: `Item ${args.params.id}` });
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

  override getData(args: this['DataArgs']): Promise<{ content: string } | null> {
    return Promise.resolve({ content: `Content for ${args.params.id}` });
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

  override getData(args: this['DataArgs']): Promise<
    {
      value: number;
    } | null
  > {
    return Promise.resolve({ value: parseInt(args.params.id, 10) });
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

  override getData(args: this['DataArgs']): Promise<
    {
      userId?: string;
      isAdmin?: boolean;
    } | null
  > {
    const context = args.context as AppContext;
    const result: { userId?: string; isAdmin?: boolean } = {};
    if (context?.userId != null) result.userId = context.userId;
    if (context?.isAdmin != null) result.isAdmin = context.isAdmin;
    return Promise.resolve(result);
  }

  override renderMarkdown(args: this['RenderArgs']): string {
    const data = args.data;
    return `User ID: ${data?.userId}, Admin: ${data?.isAdmin}`;
  }
}

// ============================================================================
// Component Name Tests
// ============================================================================

test('Component - name property identifies the component', () => {
  const component = new TestComponent();
  expect(component.name).toEqual('test-component');
});

test('Component - different components have different names', () => {
  const testComp = new TestComponent();
  const customComp = new CustomHtmlComponent();
  const validatingComp = new ValidatingComponent();

  expect(testComp.name).toEqual('test-component');
  expect(customComp.name).toEqual('custom-html');
  expect(validatingComp.name).toEqual('validating');
});

// ============================================================================
// getData() Abstract Method Tests
// ============================================================================

test('Component - getData() must be implemented by subclass', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(data).toEqual({ name: 'Item 123' });
});

test('Component - getData() receives params', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: 'custom-id' },
    context: createMockContext(),
  });

  expect(data?.name || '').toContain('custom-id');
});

test('Component - getData() can return null for loading/missing states', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: 'error' },
    context: createMockContext(),
  });

  expect(data).toEqual(null);
});

test('Component - getData() receives abort signal', async () => {
  const controller = new AbortController();
  const component = new TestComponent();

  const data = await component.getData({
    params: { id: '123' },
    signal: controller.signal,
    context: createMockContext(),
  });

  expect(data).toEqual({ name: 'Item 123' });
});

test('Component - getData() receives context', async () => {
  const component = new ContextAwareComponent();
  const context = createMockContext<AppContext>({
    userId: 'user-1',
    isAdmin: true,
  });

  const data = await component.getData({
    params: { id: '123' },
    context,
  });

  expect(data?.userId).toEqual('user-1');
  expect(data?.isAdmin).toEqual(true);
});

// ============================================================================
// renderMarkdown() Abstract Method Tests
// ============================================================================

test('Component - renderMarkdown() must be implemented by subclass', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Test Item' },
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(markdown).toContain('Test Item');
});

test('Component - renderMarkdown() receives data', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Custom Name' },
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(markdown).toEqual('# Custom Name');
});

test('Component - renderMarkdown() handles null data', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: null,
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(markdown).toEqual('# Loading...');
});

test('Component - renderMarkdown() receives params', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Item' },
    params: { id: 'special-id' },
    context: createMockContext(),
  });

  expect(markdown).toContain('Item');
});

test('Component - renderMarkdown() receives context', () => {
  const component = new ContextAwareComponent();
  const context = createMockContext<AppContext>({ userId: 'u123' });

  const markdown = component.renderMarkdown({
    data: { userId: 'u123' },
    params: { id: '1' },
    context,
  });

  expect(markdown).toContain('u123');
});

// ============================================================================
// renderHTML() Default Implementation Tests
// ============================================================================

test('Component - renderHTML() default: returns loading state when data is null', () => {
  const component = new TestComponent();
  const html = component.renderHTML({
    data: null,
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(html).toContain('Loading...');
  expect(html).toContain('data-component="test-component"');
});

test('Component - renderHTML() default: wraps markdown in container', () => {
  const component = new TestComponent();
  const html = component.renderHTML({
    data: { name: 'Test Content' },
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(html).toContain('data-component="test-component"');
  expect(html).toContain('data-markdown');
});

test('Component - renderHTML() default: escapes markdown content for HTML safety', () => {
  class EscapeTestComponent extends Component<unknown, { content: string }> {
    override readonly name = 'escape-test';

    override getData(): Promise<{ content: string } | null> {
      return Promise.resolve({ content: '<script>alert("xss")</script>' });
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return `# ${args.data?.content}`;
    }
  }

  const component = new EscapeTestComponent();
  const html = component.renderHTML({
    data: { content: '<script>alert("xss")</script>' },
    params: {},
    context: createMockContext(),
  });

  expect(html.includes('<script>')).toEqual(false);
  expect(html).toContain('&lt;script&gt;');
});

test('Component - renderHTML() can be overridden for custom HTML', () => {
  const component = new CustomHtmlComponent();
  const html = component.renderHTML({
    data: { content: 'Custom Content' },
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(html).toEqual('<custom-wrapper>Custom Content</custom-wrapper>');
});

test('Component - renderHTML() custom: can have custom loading state', () => {
  const component = new CustomHtmlComponent();
  const html = component.renderHTML({
    data: null,
    params: { id: '123' },
    context: createMockContext(),
  });

  expect(html).toContain('custom-loading');
});

// ============================================================================
// renderError() Method Tests
// ============================================================================

test('Component - renderError() formats Error objects', () => {
  const component = new TestComponent();
  const error = new Error('Something went wrong');
  const html = component.renderError({
    error,
    params: { id: '123' },
  });

  expect(html).toContain('Something went wrong');
  expect(html).toContain('data-component="test-component"');
});

test('Component - renderError() handles non-Error objects', () => {
  const component = new TestComponent();
  const html = component.renderError({
    error: 'String error message',
    params: { id: '123' },
  });

  expect(html).toContain('String error message');
});

test('Component - renderError() handles unknown error types', () => {
  const component = new TestComponent();
  const html = component.renderError({
    error: { message: 'Object error' },
    params: { id: '123' },
  });

  expect(html).toContain('[object Object]');
});

test('Component - renderError() escapes error messages for HTML safety', () => {
  const component = new TestComponent();
  const error = new Error('<script>alert("xss")</script>');
  const html = component.renderError({
    error,
    params: { id: '123' },
  });

  expect(html.includes('<script>')).toEqual(false);
  expect(html).toContain('&lt;script&gt;');
});

test('Component - renderError() includes component name in output', () => {
  const customComp = new CustomHtmlComponent();
  const error = new Error('Test error');
  const html = customComp.renderError({
    error,
    params: { id: '123' },
  });

  expect(html).toContain('data-component="custom-html"');
});

// ============================================================================
// renderMarkdownError() Method Tests
// ============================================================================

test('Component - renderMarkdownError() formats Error objects', () => {
  const component = new TestComponent();
  const error = new Error('Markdown error');
  const markdown = component.renderMarkdownError(error);

  expect(markdown).toContain('Markdown error');
  expect(markdown).toContain('test-component');
});

test('Component - renderMarkdownError() handles non-Error objects', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdownError('String error');

  expect(markdown).toContain('String error');
  expect(markdown).toContain('`test-component`');
});

test('Component - renderMarkdownError() includes component name', () => {
  const component = new ValidatingComponent();
  const error = new Error('Validation failed');
  const markdown = component.renderMarkdownError(error);

  expect(markdown).toContain('`validating`');
});

// ============================================================================
// validateParams() Optional Method Tests
// ============================================================================

test('Component - validateParams() is optional and undefined by default', () => {
  const component = new TestComponent();
  const validate = component.validateParams;

  expect(typeof validate).toEqual('undefined');
});

test('Component - validateParams() can be implemented', () => {
  const component = new ValidatingComponent();
  const result = component.validateParams({ id: '123' });

  expect(result).toEqual(undefined);
});

test('Component - validateParams() returns error message on validation failure', () => {
  const component = new ValidatingComponent();
  const result = component.validateParams({ id: '' });

  expect(result).toEqual('ID is required');
});

test('Component - validateParams() validates param types', () => {
  const component = new ValidatingComponent();
  const result = component.validateParams({ id: 'not-a-number' });

  expect(result).toEqual('ID must be a number');
});

test('Component - validateParams() returns undefined for valid params', () => {
  const component = new ValidatingComponent();
  const validResult = component.validateParams({ id: '42' });

  expect(validResult).toEqual(undefined);
});

// ============================================================================
// destroy() Optional Lifecycle Hook Tests
// ============================================================================

test('Component - destroy() is optional and not called by default', () => {
  const component = new TestComponent();
  const destroy = component.destroy;

  expect(typeof destroy).toEqual('undefined');
});

test('Component - destroy() can be implemented for cleanup', () => {
  const component = new ValidatingComponent();

  // Verify destroy was not called yet
  expect(component.destroyCalled).toEqual(false);

  // Call destroy
  component.destroy?.();

  // Verify destroy was called
  expect(component.destroyCalled).toEqual(true);
});

test('Component - destroy() can clear resources', () => {
  class ResourceComponent extends Component<unknown, unknown> {
    override readonly name = 'resource';
    listeners: (() => void)[] = [];

    override getData(): Promise<null> {
      return Promise.resolve(null);
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

  expect(component.listeners.length).toEqual(2);

  component.destroy();

  expect(component.listeners.length).toEqual(0);
});

// ============================================================================
// Generic Type Parameters Tests
// ============================================================================

test('Component - Generic TParams is used in getData', async () => {
  const component = new TestComponent();
  const data = await component.getData({
    params: { id: '456' },
    context: createMockContext(),
  });

  expect(data?.name || '').toContain('456');
});

test('Component - Generic TData is used in renderMarkdown', () => {
  const component = new TestComponent();
  const markdown = component.renderMarkdown({
    data: { name: 'Typed Data' },
    params: { id: '1' },
    context: createMockContext(),
  });

  expect(markdown).toContain('Typed Data');
});

test('Component - Generic TContext extends ComponentContext', () => {
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

  expect(data).toContain('test-user');
});

// ============================================================================
// ComponentContext Tests
// ============================================================================

test('Component - ComponentContext includes route info', () => {
  const url = new URL('/projects/123', 'http://test');
  const context = createMockContext({
    url,
    pathname: url.pathname,
    params: { id: '123' },
  });

  expect(context.pathname).toEqual('/projects/123');
  expect(context.url.pathname).toEqual('/projects/123');
  expect(context.params.id).toEqual('123');
});

test('Component - ComponentContext includes search params', () => {
  const searchParams = new URLSearchParams('sort=date&filter=active');
  const context = createMockContext({ searchParams });

  expect(context.searchParams.get('sort')).toEqual('date');
  expect(context.searchParams.get('filter')).toEqual('active');
});

test('Component - ComponentContext can include file content', () => {
  const context = createMockContext({
    files: {
      html: '<div>HTML</div>',
      md: '# Markdown',
      css: '.class { color: red; }',
    },
  });

  expect(context.files).toBeDefined();
  expect(context.files!.html).toEqual('<div>HTML</div>');
  expect(context.files!.md).toEqual('# Markdown');
  expect(context.files!.css).toEqual('.class { color: red; }');
});

test('Component - ComponentContext can include abort signal', () => {
  const controller = new AbortController();
  const context = createMockContext({
    signal: controller.signal,
  });

  expect(context.signal).toBeDefined();
  expect(context.signal!.aborted).toEqual(false);
});

test('Component - ComponentContext signal can be used for request cancellation', () => {
  const controller = new AbortController();
  const context = createMockContext({
    signal: controller.signal,
  });

  expect(context.signal!.aborted).toEqual(false);
  controller.abort();
  expect(context.signal!.aborted).toEqual(true);
});

// ============================================================================
// Element Reference Tests
// ============================================================================

test('Component - element property is optional and undefined by default', () => {
  const component = new TestComponent();

  expect(component.element).toEqual(undefined);
});

// ============================================================================
// Files Property Tests
// ============================================================================

test('Component - files property is optional', () => {
  const component = new TestComponent();

  expect(component.files).toEqual(undefined);
});

test('Component - files property can contain file content', () => {
  // Create a component with files via constructor/initialization
  class ComponentWithFiles extends Component<unknown, unknown> {
    override readonly name = 'with-files';
    override readonly files = {
      html: '<div>Content</div>',
      md: '# Content',
      css: '.style {}',
    };

    override getData(): Promise<null> {
      return Promise.resolve(null);
    }

    override renderMarkdown(): string {
      return 'Content';
    }
  }

  const component = new ComponentWithFiles();

  expect(component.files?.html).toEqual('<div>Content</div>');
  expect(component.files?.md).toEqual('# Content');
  expect(component.files?.css).toEqual('.style {}');
});

// ============================================================================
// Type Carrier Tests (DataArgs and RenderArgs)
// ============================================================================

test('Component - DataArgs type carrier provides correct type hints', async () => {
  const component = new TestComponent();

  // This test verifies the type system works
  // The DataArgs type should have params, signal, and context
  const args: typeof component['DataArgs'] = {
    params: { id: 'test' },
    signal: new AbortController().signal,
    context: createMockContext(),
  };

  const data = await component.getData(args);
  expect(data?.name || '').toContain('test');
});

test('Component - RenderArgs type carrier provides correct type hints', () => {
  const component = new TestComponent();

  // This test verifies the RenderArgs type system
  const args: typeof component['RenderArgs'] = {
    data: { name: 'Test' },
    params: { id: 'test' },
    context: createMockContext(),
  };

  const markdown = component.renderMarkdown(args);
  expect(markdown).toContain('Test');
});

// ============================================================================
// Integration & Contract Tests
// ============================================================================

test('Component - contract: getData -> renderMarkdown pipeline works', async () => {
  const component = new TestComponent();

  // Get data
  const data = await component.getData({
    params: { id: 'integration' },
    context: createMockContext(),
  });

  // Render markdown with that data
  const markdown = component.renderMarkdown({
    data,
    params: { id: 'integration' },
    context: createMockContext(),
  });

  expect(markdown).toContain('integration');
});

test('Component - contract: getData -> renderHTML pipeline works', async () => {
  const component = new TestComponent();

  // Get data
  const data = await component.getData({
    params: { id: 'html-test' },
    context: createMockContext(),
  });

  // Render HTML with that data
  const html = component.renderHTML({
    data,
    params: { id: 'html-test' },
    context: createMockContext(),
  });

  expect(html).toContain('data-markdown');
});

test('Component - contract: null data flows through pipeline', async () => {
  const component = new TestComponent();

  // Get null data
  const data = await component.getData({
    params: { id: 'error' },
    context: createMockContext(),
  });

  expect(data).toEqual(null);

  // Render markdown with null
  const markdown = component.renderMarkdown({
    data,
    params: { id: 'error' },
    context: createMockContext(),
  });

  expect(markdown).toContain('Loading');

  // Render HTML with null
  const html = component.renderHTML({
    data,
    params: { id: 'error' },
    context: createMockContext(),
  });

  expect(html).toContain('Loading');
});

test('Component - contract: error handling flow', () => {
  const component = new TestComponent();
  const error = new Error('Test error');

  // renderError for HTML
  const htmlError = component.renderError({
    error,
    params: { id: '123' },
  });

  expect(htmlError).toContain('Test error');

  // renderMarkdownError for markdown
  const mdError = component.renderMarkdownError(error);

  expect(mdError).toContain('Test error');
  expect(mdError).toContain('test-component');
});

// ============================================================================
// Type Safety & Polymorphism Tests
// ============================================================================

test('Component - subclasses can have different TParams types', () => {
  class StringParamComponent extends Component<{ query: string }, unknown> {
    override readonly name = 'string-params';

    override getData(_args: this['DataArgs']): Promise<null> {
      return Promise.resolve(null);
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return `Query: ${args.params.query}`;
    }
  }

  class NumberParamComponent extends Component<{ id: number }, unknown> {
    override readonly name = 'number-params';

    override getData(_args: this['DataArgs']): Promise<null> {
      return Promise.resolve(null);
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
    context: createMockContext(),
  });

  const numMd = numComp.renderMarkdown({
    data: null,
    params: { id: 42 },
    context: createMockContext(),
  });

  expect(strMd).toContain('search');
  expect(numMd).toContain('42');
});

test('Component - subclasses can have different TData types', () => {
  class UserData extends Component<unknown, { userId: string; name: string }> {
    override readonly name = 'user-data';

    override getData(): Promise<{ userId: string; name: string } | null> {
      return Promise.resolve(null);
    }

    override renderMarkdown(args: this['RenderArgs']): string {
      return args.data?.name ?? 'Unknown';
    }
  }

  class PostData extends Component<unknown, { title: string; body: string }> {
    override readonly name = 'post-data';

    override getData(): Promise<{ title: string; body: string } | null> {
      return Promise.resolve(null);
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
    context: createMockContext(),
  });

  const postMd = postComp.renderMarkdown({
    data: { title: 'My Post', body: 'Content' },
    params: {},
    context: createMockContext(),
  });

  expect(userMd).toContain('Alice');
  expect(postMd).toContain('My Post');
});

test('Component - subclasses can extend ComponentContext with custom properties', () => {
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

    override getData(args: this['DataArgs']): Promise<
      {
        allowed: boolean;
      } | null
    > {
      const context = args.context as CustomContext;
      const allowed = context?.permissions.includes('edit') ?? false;
      return Promise.resolve({ allowed });
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

  expect(markdown).toContain('Edit allowed');
});
