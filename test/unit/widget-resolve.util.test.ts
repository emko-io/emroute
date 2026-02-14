/**
 * Widget Resolution Utility Tests
 *
 * Comprehensive test suite for:
 * - resolveWidgetTags: Widget tag resolution with registry lookup
 * - parseAttrsToParams: HTML attribute parsing and conversion
 * - Widget data loading and context handling
 * - HTML/Markdown rendering modes
 * - Error handling for failed widgets
 * - Lazy loading attribute handling
 * - Widget params extraction and conversion
 */

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { parseAttrsToParams, resolveWidgetTags } from '../../src/util/widget-resolve.util.ts';
import { WidgetComponent } from '../../src/component/widget.component.ts';
import { Component } from '../../src/component/abstract.component.ts';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';
import type { RouteInfo } from '../../src/type/route.type.ts';

/**
 * Test Helpers
 */

/** File loader type for widget file loading */
type WidgetFileLoader = (
  widgetName: string,
  declaredFiles?: { html?: string; md?: string; css?: string },
) => Promise<{ html?: string; md?: string; css?: string }>;

/** Create a test RouteInfo for widget resolution */
function createTestRouteInfo(
  pathname = '/test',
  pattern = '/test',
  params: Record<string, string> = {},
): RouteInfo {
  return {
    pathname,
    pattern,
    params,
    searchParams: new URLSearchParams(),
  };
}

/** Create a test ComponentContext with optional files */
function _createTestContext(
  files?: ComponentContext['files'],
  routeInfo = createTestRouteInfo(),
): ComponentContext {
  return {
    ...routeInfo,
    ...(files !== undefined ? { files } : {}),
  };
}

/**
 * Mock Widget Components for Testing
 */

/** Simple widget that just renders static content */
class SimpleWidget extends WidgetComponent<Record<string, unknown>, { message: string }> {
  override readonly name = 'simple';

  override getData(): Promise<{ message: string }> {
    return Promise.resolve({ message: 'Hello Widget' });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    return `<div>${data?.message ?? 'Loading...'}</div>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    return data?.message ?? '';
  }
}

/** Widget that uses params in rendering */
class ParamWidget extends WidgetComponent<
  { count?: string; name?: string },
  { total: number; displayName: string }
> {
  override readonly name = 'param-widget';

  override getData({ params }: this['DataArgs']) {
    const count = parseInt(params.count ?? '0', 10);
    return Promise.resolve({
      total: count,
      displayName: params.name ?? 'Anonymous',
    });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    return `<span>${data?.displayName}: ${data?.total}</span>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    return data ? `${data.displayName}: ${data.total}` : '';
  }
}

/** Widget that uses context */
class ContextWidget extends WidgetComponent<Record<string, unknown>, { pathname: string }> {
  override readonly name = 'context-widget';

  override getData({ context }: this['DataArgs']) {
    return Promise.resolve({ pathname: context?.pathname ?? 'unknown' });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    return `<p>Path: ${data?.pathname}</p>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    return data ? `Path: ${data.pathname}` : '';
  }
}

/** Widget that uses files from context */
class FileWidget extends WidgetComponent<Record<string, unknown>, { content: string }> {
  override readonly name = 'file-widget';
  override readonly files = { html: 'widgets/file.html' };

  override getData(): Promise<{ content: string }> {
    return Promise.resolve({ content: 'File content' });
  }

  override renderHTML({ data, context }: this['RenderArgs']): string {
    const html = context?.files?.html ?? '<fallback/>';
    return `${data?.content}: ${html}`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    return data?.content ?? '';
  }
}

/** Widget that throws an error */
class ErrorWidget extends WidgetComponent<Record<string, unknown>, null> {
  override readonly name = 'error-widget';

  override getData(): Promise<null> {
    throw new Error('Widget data fetch failed');
  }

  override renderHTML(): string {
    return '<error/>';
  }

  override renderMarkdown(): string {
    return '';
  }
}

/** Widget that throws during rendering */
class RenderErrorWidget extends WidgetComponent<Record<string, unknown>, { status: string }> {
  override readonly name = 'render-error';

  override getData(): Promise<{ status: string }> {
    return Promise.resolve({ status: 'ok' });
  }

  override renderHTML(): string {
    throw new Error('Render failed');
  }

  override renderMarkdown(): string {
    throw new Error('Render failed');
  }
}

/** Widget with numbers in name for validation testing */
class Widget2 extends WidgetComponent<Record<string, unknown>, { message: string }> {
  override readonly name = 'widget2';

  override getData(): Promise<{ message: string }> {
    return Promise.resolve({ message: 'Hello Widget' });
  }

  override renderHTML({ data }: this['RenderArgs']): string {
    return `<div>${data?.message ?? 'Loading...'}</div>`;
  }

  override renderMarkdown({ data }: this['RenderArgs']): string {
    return data?.message ?? '';
  }
}

/**
 * Mock Registry
 */

class MockRegistry {
  private widgets = new Map<string, Component>();

  constructor(...widgets: Component[]) {
    widgets.forEach((w) => this.widgets.set(w.name, w));
  }

  get(name: string): Component | undefined {
    return this.widgets.get(name);
  }
}

/**
 * Test Suite: parseAttrsToParams
 */

Deno.test('parseAttrsToParams - empty string', () => {
  assertEquals(parseAttrsToParams(''), {});
});

Deno.test('parseAttrsToParams - single double-quoted attribute', () => {
  assertEquals(parseAttrsToParams('coin="bitcoin"'), { coin: 'bitcoin' });
});

Deno.test('parseAttrsToParams - single single-quoted attribute', () => {
  assertEquals(parseAttrsToParams("coin='ethereum'"), { coin: 'ethereum' });
});

Deno.test('parseAttrsToParams - unquoted attribute', () => {
  assertEquals(parseAttrsToParams('amount=1000'), { amount: 1000 });
});

Deno.test('parseAttrsToParams - boolean attribute (no value)', () => {
  assertEquals(parseAttrsToParams('disabled'), { disabled: '' });
});

Deno.test('parseAttrsToParams - multiple attributes mixed quotes', () => {
  assertEquals(parseAttrsToParams('coin="bitcoin" amount=50 enabled'), {
    coin: 'bitcoin',
    amount: 50,
    enabled: '',
  });
});

Deno.test('parseAttrsToParams - kebab-case converted to camelCase', () => {
  assertEquals(parseAttrsToParams('my-coin="bitcoin"'), { myCoin: 'bitcoin' });
});

Deno.test('parseAttrsToParams - multiple kebab-case attributes', () => {
  assertEquals(parseAttrsToParams('my-coin="bitcoin" your-amount=42'), {
    myCoin: 'bitcoin',
    yourAmount: 42,
  });
});

Deno.test('parseAttrsToParams - JSON number values parsed', () => {
  assertEquals(parseAttrsToParams('count="42"'), { count: 42 });
});

Deno.test('parseAttrsToParams - JSON boolean values parsed', () => {
  assertEquals(parseAttrsToParams('active="true" disabled="false"'), {
    active: true,
    disabled: false,
  });
});

Deno.test('parseAttrsToParams - JSON null parsed', () => {
  assertEquals(parseAttrsToParams('value="null"'), { value: null });
});

Deno.test('parseAttrsToParams - JSON object parsed', () => {
  assertEquals(parseAttrsToParams('config=\'{"x":1,"y":2}\''), {
    config: { x: 1, y: 2 },
  });
});

Deno.test('parseAttrsToParams - invalid JSON falls back to string', () => {
  assertEquals(parseAttrsToParams('text="not json"'), { text: 'not json' });
});

Deno.test('parseAttrsToParams - HTML entities decoded in double quotes', () => {
  assertEquals(parseAttrsToParams('text="hello &amp; goodbye"'), {
    text: 'hello & goodbye',
  });
});

Deno.test('parseAttrsToParams - HTML entities decoded in single quotes', () => {
  assertEquals(parseAttrsToParams("text='hello &amp; goodbye'"), {
    text: 'hello & goodbye',
  });
});

Deno.test('parseAttrsToParams - quotes decoded', () => {
  assertEquals(parseAttrsToParams('text="say &quot;hello&quot;"'), {
    text: 'say "hello"',
  });
});

Deno.test('parseAttrsToParams - data-ssr attribute is skipped', () => {
  assertEquals(parseAttrsToParams('coin="bitcoin" data-ssr="ignored"'), {
    coin: 'bitcoin',
  });
});

Deno.test('parseAttrsToParams - lazy attribute is skipped', () => {
  assertEquals(parseAttrsToParams('name="test" lazy'), {
    name: 'test',
  });
});

Deno.test('parseAttrsToParams - whitespace handling in attributes', () => {
  assertEquals(parseAttrsToParams('coin="bitcoin" amount=50'), {
    coin: 'bitcoin',
    amount: 50,
  });
});

Deno.test('parseAttrsToParams - complex real-world example', () => {
  assertEquals(
    parseAttrsToParams('coin="bitcoin" price=42000 active="true" my-custom-prop="value"'),
    {
      coin: 'bitcoin',
      price: 42000,
      active: true,
      myCustomProp: 'value',
    },
  );
});

/**
 * Test Suite: resolveWidgetTags - Basic Resolution
 */

Deno.test('resolveWidgetTags - no widgets in HTML', async () => {
  const html = '<div>No widgets here</div>';
  const registry = new MockRegistry();
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertEquals(result, html);
});

Deno.test('resolveWidgetTags - single widget resolution', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, '<widget-simple');
  assertStringIncludes(result, 'Hello Widget');
  assertStringIncludes(result, '</widget-simple>');
});

Deno.test('resolveWidgetTags - multiple widgets in HTML', async () => {
  const html = '<div><widget-simple></widget-simple><widget-simple></widget-simple></div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  const matches = result.match(/<widget-simple/g);
  assertEquals(matches?.length, 2);
});

Deno.test('resolveWidgetTags - widget not in registry returns unchanged', async () => {
  const html = '<widget-unknown></widget-unknown>';
  const registry = new MockRegistry();
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertEquals(result, html);
});

Deno.test('resolveWidgetTags - mixed registered and unregistered widgets', async () => {
  const html = '<div><widget-simple></widget-simple><widget-unknown></widget-unknown></div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Hello Widget');
  assertStringIncludes(result, '<widget-unknown></widget-unknown>');
});

/**
 * Test Suite: resolveWidgetTags - Attributes and Params
 */

Deno.test('resolveWidgetTags - widget with single attribute', async () => {
  const html = '<widget-param-widget count="5"></widget-param-widget>';
  const registry = new MockRegistry(new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Anonymous: 5');
});

Deno.test('resolveWidgetTags - widget with multiple attributes', async () => {
  const html = '<widget-param-widget count="10" name="Alice"></widget-param-widget>';
  const registry = new MockRegistry(new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Alice: 10');
});

Deno.test('resolveWidgetTags - widget with kebab-case attributes', async () => {
  const html = '<widget-param-widget your-count="15" your-name="Bob"></widget-param-widget>';
  const registry = new MockRegistry(
    new (class extends ParamWidget {
      override getData({ params }: this['DataArgs']) {
        return Promise.resolve({
          total: parseInt(params.yourCount ?? '0', 10),
          displayName: params.yourName ?? 'Anonymous',
        });
      }
    })(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Bob: 15');
});

Deno.test('resolveWidgetTags - lazy attribute is preserved in output', async () => {
  const html = '<widget-simple lazy></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'lazy');
});

/**
 * Test Suite: resolveWidgetTags - Data and SSR Attributes
 */

Deno.test('resolveWidgetTags - injects data-ssr attribute', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'data-ssr=');
});

Deno.test('resolveWidgetTags - data-ssr contains JSON serialized data', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'message');
  assertStringIncludes(result, 'Hello Widget');
});

Deno.test('resolveWidgetTags - escapes ampersands in data-ssr', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(
    new (class extends SimpleWidget {
      override getData() {
        return Promise.resolve({ message: 'Hello & goodbye' });
      }
    })(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, '&amp;');
});

Deno.test('resolveWidgetTags - escapes single quotes in data-ssr', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(
    new (class extends SimpleWidget {
      override getData() {
        return Promise.resolve({ message: "It's working" });
      }
    })(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  // Single quotes in JSON values should be escaped as &#39; since we use single quotes for attribute wrapper
  assertStringIncludes(result, '&#39;');
  // Should use single quotes for data-ssr attribute
  assertStringIncludes(result, "data-ssr='");
});

/**
 * Test Suite: resolveWidgetTags - Context Handling
 */

Deno.test('resolveWidgetTags - passes route info to widget context', async () => {
  const html = '<widget-context-widget></widget-context-widget>';
  const registry = new MockRegistry(new ContextWidget());
  const routeInfo = createTestRouteInfo('/test/path', '/test/:id');

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, '/test/path');
});

Deno.test('resolveWidgetTags - uses context provider if supplied', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const contextProvider: ContextProvider = (base) => ({
    ...base,
    customProp: 'custom-value',
  });

  const result = await resolveWidgetTags(html, registry, routeInfo, undefined, contextProvider);
  assertStringIncludes(result, 'Hello Widget');
});

Deno.test('resolveWidgetTags - file loader is called if supplied', async () => {
  const html = '<widget-file-widget></widget-file-widget>';
  const registry = new MockRegistry(new FileWidget());
  const routeInfo = createTestRouteInfo();

  let fileLoaderCalled = false;
  const fileLoader: WidgetFileLoader = (widgetName: string) => {
    fileLoaderCalled = true;
    assertEquals(widgetName, 'file-widget');
    return Promise.resolve({ html: '<div>Loaded from file</div>' });
  };

  const result = await resolveWidgetTags(html, registry, routeInfo, fileLoader);
  assertEquals(fileLoaderCalled, true);
  assertStringIncludes(result, 'File content');
});

Deno.test('resolveWidgetTags - file loader receives declared files', async () => {
  const html = '<widget-file-widget></widget-file-widget>';
  const fileWidget = new FileWidget();
  const registry = new MockRegistry(fileWidget);
  const routeInfo = createTestRouteInfo();

  let declaredFiles: { html?: string; md?: string; css?: string } | undefined;
  const fileLoader: WidgetFileLoader = (_widgetName: string, declared) => {
    declaredFiles = declared;
    return Promise.resolve({ html: '<div>Loaded</div>' });
  };

  await resolveWidgetTags(html, registry, routeInfo, fileLoader);
  assertEquals(declaredFiles, fileWidget.files);
});

/**
 * Test Suite: resolveWidgetTags - Error Handling
 */

Deno.test('resolveWidgetTags - widget getData error leaves tag unchanged', async () => {
  const html = '<widget-error-widget></widget-error-widget>';
  const registry = new MockRegistry(new ErrorWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertEquals(result, html);
});

Deno.test('resolveWidgetTags - widget render error leaves tag unchanged', async () => {
  const html = '<widget-render-error></widget-render-error>';
  const registry = new MockRegistry(new RenderErrorWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertEquals(result, html);
});

Deno.test('resolveWidgetTags - error in one widget does not break others', async () => {
  const html =
    '<div><widget-simple></widget-simple><widget-error-widget></widget-error-widget></div>';
  const registry = new MockRegistry(new SimpleWidget(), new ErrorWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Hello Widget');
  assertStringIncludes(result, '<widget-error-widget></widget-error-widget>');
});

Deno.test('resolveWidgetTags - file loader error leaves tag unchanged', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const fileLoader: WidgetFileLoader = () => {
    throw new Error('File load failed');
  };

  const result = await resolveWidgetTags(html, registry, routeInfo, fileLoader);
  assertEquals(result, html);
});

/**
 * Test Suite: resolveWidgetTags - Tag Matching and Content
 */

Deno.test('resolveWidgetTags - captures widget name with hyphens', async () => {
  const html = '<widget-param-widget count="5"></widget-param-widget>';
  const registry = new MockRegistry(new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, '<widget-param-widget');
});

Deno.test('resolveWidgetTags - preserves original attributes in output', async () => {
  const html = '<widget-simple id="my-widget" class="styled"></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'id="my-widget"');
  assertStringIncludes(result, 'class="styled"');
});

Deno.test('resolveWidgetTags - handles nested angle brackets in content', async () => {
  const html = '<div><widget-simple></widget-simple></div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertEquals(result.startsWith('<div>'), true);
  assertEquals(result.endsWith('</div>'), true);
});

Deno.test('resolveWidgetTags - replaces widgets from end to preserve indices', async () => {
  const html = '<widget-simple></widget-simple>TEXT<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'TEXT');
  const matches = result.match(/<widget-simple/g);
  assertEquals(matches?.length, 2);
});

/**
 * Test Suite: resolveWidgetTags - Widget Name Validation
 */

Deno.test('resolveWidgetTags - widget names must start with lowercase letter', async () => {
  const html = '<widget-123invalid></widget-123invalid>';
  const registry = new MockRegistry();
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertEquals(result, html);
});

Deno.test('resolveWidgetTags - widget names can contain numbers after first char', async () => {
  const html = '<widget-widget2></widget-widget2>';
  const registry = new MockRegistry(new Widget2());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Hello Widget');
});

/**
 * Test Suite: resolveWidgetTags - Attribute Edge Cases
 */

Deno.test('resolveWidgetTags - empty attribute value', async () => {
  const html = '<widget-simple attr=""></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'attr=""');
});

Deno.test('resolveWidgetTags - attribute with only spaces', async () => {
  const html = '<widget-simple attr="   "></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'attr=');
});

Deno.test('resolveWidgetTags - self-closing widget tag syntax not matched', async () => {
  const html = '<widget-simple />';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertEquals(result, html);
});

/**
 * Test Suite: Complex Scenarios
 */

Deno.test('resolveWidgetTags - concurrent widget resolution', async () => {
  const html =
    '<widget-simple></widget-simple><widget-param-widget count="5"></widget-param-widget>';
  const registry = new MockRegistry(new SimpleWidget(), new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Hello Widget');
  assertStringIncludes(result, 'Anonymous: 5');
});

Deno.test('resolveWidgetTags - widget with all attribute quote styles', async () => {
  const customWidget = new (class extends ParamWidget {
    override getData({ params }: this['DataArgs']) {
      return Promise.resolve({
        total: parseInt(params.dQuote ?? '0', 10) +
          parseInt(params.sQuote ?? '0', 10) +
          parseInt(params.noQuote ?? '0', 10),
        displayName: 'sum',
      });
    }
  })();
  const html = '<widget-param-widget d-quote="10" s-quote=\'5\' no-quote=3></widget-param-widget>';
  const registry = new MockRegistry(customWidget);
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'sum: 18');
});

Deno.test('resolveWidgetTags - very long HTML document with multiple widgets', async () => {
  const long = '<div>' + '<widget-simple></widget-simple>'.repeat(10) + '</div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(long, registry, routeInfo);
  const matches = result.match(/<widget-simple/g);
  assertEquals(matches?.length, 10);
  assertStringIncludes(result, 'Hello Widget');
});

Deno.test('resolveWidgetTags - whitespace around widget tags', async () => {
  const html = `
    <widget-simple></widget-simple>
    <widget-param-widget count="5"></widget-param-widget>
  `;
  const registry = new MockRegistry(new SimpleWidget(), new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  assertStringIncludes(result, 'Hello Widget');
  assertStringIncludes(result, 'Anonymous: 5');
});

/**
 * Test Suite: Nested Widget Resolution
 */

Deno.test('resolveWidgetTags - nested widgets are resolved', async () => {
  class InnerWidget extends WidgetComponent<Record<string, unknown>, { text: string }> {
    override readonly name = 'inner';
    override getData(): Promise<{ text: string }> {
      return Promise.resolve({ text: 'Inner' });
    }
    override renderHTML({ data }: this['RenderArgs']): string {
      return data ? `<span>${data.text}</span>` : '';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  class OuterWidget extends WidgetComponent<Record<string, unknown>, { text: string }> {
    override readonly name = 'outer';
    override getData(): Promise<{ text: string }> {
      return Promise.resolve({ text: 'Outer' });
    }
    override renderHTML({ data }: this['RenderArgs']): string {
      return data ? `<div>${data.text}: <widget-inner></widget-inner></div>` : '';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  const html = '<widget-outer></widget-outer>';
  const registry = new MockRegistry(new OuterWidget(), new InnerWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);

  // Both outer and inner should be resolved
  assertStringIncludes(result, 'Outer:');
  assertStringIncludes(result, '<span>Inner</span>');
  assertStringIncludes(result, 'data-ssr=');
});

Deno.test('resolveWidgetTags - deeply nested widgets (3 levels)', async () => {
  class Level3Widget extends WidgetComponent<Record<string, unknown>, { level: number }> {
    override readonly name = 'level3';
    override getData(): Promise<{ level: number }> {
      return Promise.resolve({ level: 3 });
    }
    override renderHTML({ data }: this['RenderArgs']): string {
      return data ? `<span>Level ${data.level}</span>` : '';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  class Level2Widget extends WidgetComponent<Record<string, unknown>, { level: number }> {
    override readonly name = 'level2';
    override getData(): Promise<{ level: number }> {
      return Promise.resolve({ level: 2 });
    }
    override renderHTML({ data }: this['RenderArgs']): string {
      return data ? `<div>Level ${data.level}: <widget-level3></widget-level3></div>` : '';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  class Level1Widget extends WidgetComponent<Record<string, unknown>, { level: number }> {
    override readonly name = 'level1';
    override getData(): Promise<{ level: number }> {
      return Promise.resolve({ level: 1 });
    }
    override renderHTML({ data }: this['RenderArgs']): string {
      return data ? `<div>Level ${data.level}: <widget-level2></widget-level2></div>` : '';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  const html = '<widget-level1></widget-level1>';
  const registry = new MockRegistry(
    new Level1Widget(),
    new Level2Widget(),
    new Level3Widget(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);

  // All three levels should be resolved
  assertStringIncludes(result, 'Level 1:');
  assertStringIncludes(result, 'Level 2:');
  assertStringIncludes(result, '<span>Level 3</span>');
});

Deno.test('resolveWidgetTags - nested widgets with params', async () => {
  class CounterWidget extends WidgetComponent<{ value?: number }, { count: number }> {
    override readonly name = 'counter';
    override getData({ params }: this['DataArgs']): Promise<{ count: number }> {
      return Promise.resolve({ count: params.value || 0 });
    }
    override renderHTML({ data }: this['RenderArgs']): string {
      return data ? `<span>Count: ${data.count}</span>` : '';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  class CardWidget extends WidgetComponent<Record<string, unknown>, { title: string }> {
    override readonly name = 'card';
    override getData(): Promise<{ title: string }> {
      return Promise.resolve({ title: 'Card' });
    }
    override renderHTML({ data }: this['RenderArgs']): string {
      return data
        ? `<div class="card"><h3>${data.title}</h3><widget-counter value="42"></widget-counter></div>`
        : '';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  const html = '<widget-card></widget-card>';
  const registry = new MockRegistry(new CardWidget(), new CounterWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);

  assertStringIncludes(result, 'Card');
  assertStringIncludes(result, 'Count: 42');
});

Deno.test('resolveWidgetTags - max depth limit prevents infinite loops', async () => {
  class RecursiveWidget extends WidgetComponent<Record<string, unknown>, { text: string }> {
    override readonly name = 'recursive';
    override getData(): Promise<{ text: string }> {
      return Promise.resolve({ text: 'loop' });
    }
    override renderHTML(): string {
      // Widget that renders itself - would cause infinite loop
      return '<widget-recursive></widget-recursive>';
    }
    override renderMarkdown(): string {
      return '';
    }
  }

  const html = '<widget-recursive></widget-recursive>';
  const registry = new MockRegistry(new RecursiveWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);

  // Should stop after max depth and still return valid HTML
  assertExists(result);
  assertStringIncludes(result, 'widget-recursive');
});

/**
 * Test Suite: parseAttrsToParams Edge Cases
 */

Deno.test('parseAttrsToParams - JSON array parsed', () => {
  assertEquals(parseAttrsToParams("items='[1,2,3]'"), { items: [1, 2, 3] });
});

Deno.test('parseAttrsToParams - nested JSON object', () => {
  assertEquals(parseAttrsToParams('config=\'{"user":{"name":"Alice"}}\''), {
    config: { user: { name: 'Alice' } },
  });
});

Deno.test('parseAttrsToParams - attribute with dash at start requires quotes', () => {
  assertEquals(parseAttrsToParams('-attr="value"'), { attr: 'value' });
});

Deno.test('parseAttrsToParams - multiple consecutive spaces between attributes', () => {
  assertEquals(parseAttrsToParams('a="1" b="2"'), { a: 1, b: 2 });
});

Deno.test('parseAttrsToParams - attributes separated by space', () => {
  assertEquals(parseAttrsToParams('x="100" y="200"'), { x: 100, y: 200 });
});
