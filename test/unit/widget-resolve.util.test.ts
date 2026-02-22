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

import { test, expect, describe } from 'bun:test';
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

test('parseAttrsToParams - empty string', () => {
  expect(parseAttrsToParams('')).toEqual({});
});

test('parseAttrsToParams - single double-quoted attribute', () => {
  expect(parseAttrsToParams('coin="bitcoin"')).toEqual({ coin: 'bitcoin' });
});

test('parseAttrsToParams - single single-quoted attribute', () => {
  expect(parseAttrsToParams("coin='ethereum'")).toEqual({ coin: 'ethereum' });
});

test('parseAttrsToParams - unquoted attribute', () => {
  expect(parseAttrsToParams('amount=1000')).toEqual({ amount: 1000 });
});

test('parseAttrsToParams - boolean attribute (no value)', () => {
  expect(parseAttrsToParams('disabled')).toEqual({ disabled: '' });
});

test('parseAttrsToParams - multiple attributes mixed quotes', () => {
  expect(parseAttrsToParams('coin="bitcoin" amount=50 enabled')).toEqual({
    coin: 'bitcoin',
    amount: 50,
    enabled: '',
  });
});

test('parseAttrsToParams - kebab-case converted to camelCase', () => {
  expect(parseAttrsToParams('my-coin="bitcoin"')).toEqual({ myCoin: 'bitcoin' });
});

test('parseAttrsToParams - multiple kebab-case attributes', () => {
  expect(parseAttrsToParams('my-coin="bitcoin" your-amount=42')).toEqual({
    myCoin: 'bitcoin',
    yourAmount: 42,
  });
});

test('parseAttrsToParams - JSON number values parsed', () => {
  expect(parseAttrsToParams('count="42"')).toEqual({ count: 42 });
});

test('parseAttrsToParams - JSON boolean values parsed', () => {
  expect(parseAttrsToParams('active="true" disabled="false"')).toEqual({
    active: true,
    disabled: false,
  });
});

test('parseAttrsToParams - JSON null parsed', () => {
  expect(parseAttrsToParams('value="null"')).toEqual({ value: null });
});

test('parseAttrsToParams - JSON object parsed', () => {
  expect(parseAttrsToParams('config=\'{"x":1,"y":2}\'')).toEqual({
    config: { x: 1, y: 2 },
  });
});

test('parseAttrsToParams - invalid JSON falls back to string', () => {
  expect(parseAttrsToParams('text="not json"')).toEqual({ text: 'not json' });
});

test('parseAttrsToParams - HTML entities decoded in double quotes', () => {
  expect(parseAttrsToParams('text="hello &amp; goodbye"')).toEqual({
    text: 'hello & goodbye',
  });
});

test('parseAttrsToParams - HTML entities decoded in single quotes', () => {
  expect(parseAttrsToParams("text='hello &amp; goodbye'")).toEqual({
    text: 'hello & goodbye',
  });
});

test('parseAttrsToParams - quotes decoded', () => {
  expect(parseAttrsToParams('text="say &quot;hello&quot;"')).toEqual({
    text: 'say "hello"',
  });
});

test('parseAttrsToParams - ssr attribute is skipped', () => {
  expect(parseAttrsToParams('coin="bitcoin" ssr="ignored"')).toEqual({
    coin: 'bitcoin',
  });
});

test('parseAttrsToParams - lazy attribute is skipped', () => {
  expect(parseAttrsToParams('name="test" lazy')).toEqual({
    name: 'test',
  });
});

test('parseAttrsToParams - whitespace handling in attributes', () => {
  expect(parseAttrsToParams('coin="bitcoin" amount=50')).toEqual({
    coin: 'bitcoin',
    amount: 50,
  });
});

test('parseAttrsToParams - complex real-world example', () => {
  expect(
    parseAttrsToParams('coin="bitcoin" price=42000 active="true" my-custom-prop="value"'),
  ).toEqual(
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

test('resolveWidgetTags - no widgets in HTML', async () => {
  const html = '<div>No widgets here</div>';
  const registry = new MockRegistry();
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toEqual(html);
});

test('resolveWidgetTags - single widget resolution', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('<widget-simple');
  expect(result).toContain('Hello Widget');
  expect(result).toContain('</widget-simple>');
});

test('resolveWidgetTags - multiple widgets in HTML', async () => {
  const html = '<div><widget-simple></widget-simple><widget-simple></widget-simple></div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  const matches = result.match(/<widget-simple/g);
  expect(matches?.length).toEqual(2);
});

test('resolveWidgetTags - widget not in registry returns unchanged', async () => {
  const html = '<widget-unknown></widget-unknown>';
  const registry = new MockRegistry();
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toEqual(html);
});

test('resolveWidgetTags - mixed registered and unregistered widgets', async () => {
  const html = '<div><widget-simple></widget-simple><widget-unknown></widget-unknown></div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Hello Widget');
  expect(result).toContain('<widget-unknown></widget-unknown>');
});

/**
 * Test Suite: resolveWidgetTags - Attributes and Params
 */

test('resolveWidgetTags - widget with single attribute', async () => {
  const html = '<widget-param-widget count="5"></widget-param-widget>';
  const registry = new MockRegistry(new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Anonymous: 5');
});

test('resolveWidgetTags - widget with multiple attributes', async () => {
  const html = '<widget-param-widget count="10" name="Alice"></widget-param-widget>';
  const registry = new MockRegistry(new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Alice: 10');
});

test('resolveWidgetTags - widget with kebab-case attributes', async () => {
  const html = '<widget-param-widget your-count="15" your-name="Bob"></widget-param-widget>';
  const registry = new MockRegistry(
    new (class extends ParamWidget {
      override getData({ params }: { params: Record<string, string>; context: ComponentContext }) {
        return Promise.resolve({
          total: parseInt(params.yourCount ?? '0', 10),
          displayName: params.yourName ?? 'Anonymous',
        });
      }
    })(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Bob: 15');
});

test('resolveWidgetTags - lazy attribute is preserved in output', async () => {
  const html = '<widget-simple lazy></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('lazy');
});

/**
 * Test Suite: resolveWidgetTags - Data and SSR Attributes
 */

test('resolveWidgetTags - injects boolean ssr attribute', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result.includes(' ssr ') || result.includes(' ssr>')).toBeTruthy();
});

test('resolveWidgetTags - default widget has no light DOM data', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  // Without exposeSsrData, no JSON data in light DOM
  expect(result).toContain('</template></widget-simple>');
});

test('resolveWidgetTags - exposeSsrData serializes data into light DOM', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(
    new (class extends SimpleWidget {
      override readonly exposeSsrData = true;
    })(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  // Data should appear as light DOM text after </template>
  expect(result).toContain('</template>');
  expect(result).toContain('Hello Widget');
  expect(result).toContain('message');
});

test('resolveWidgetTags - escapes ampersands in light DOM data', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(
    new (class extends SimpleWidget {
      override readonly exposeSsrData = true;
      override getData() {
        return Promise.resolve({ message: 'Hello & goodbye' });
      }
    })(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('&amp;');
});

test('resolveWidgetTags - escapes single quotes in light DOM data', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(
    new (class extends SimpleWidget {
      override readonly exposeSsrData = true;
      override getData() {
        return Promise.resolve({ message: "It's working" });
      }
    })(),
  );
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('&#39;');
});

/**
 * Test Suite: resolveWidgetTags - Context Handling
 */

test('resolveWidgetTags - passes route info to widget context', async () => {
  const html = '<widget-context-widget></widget-context-widget>';
  const registry = new MockRegistry(new ContextWidget());
  const routeInfo = createTestRouteInfo('/test/path', '/test/:id');

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('/test/path');
});

test('resolveWidgetTags - uses context provider if supplied', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const contextProvider: ContextProvider = (base) => ({
    ...base,
    customProp: 'custom-value',
  });

  const result = await resolveWidgetTags(html, registry, routeInfo, undefined, contextProvider);
  expect(result).toContain('Hello Widget');
});

test('resolveWidgetTags - file loader is called if supplied', async () => {
  const html = '<widget-file-widget></widget-file-widget>';
  const registry = new MockRegistry(new FileWidget());
  const routeInfo = createTestRouteInfo();

  let fileLoaderCalled = false;
  const fileLoader: WidgetFileLoader = (widgetName: string) => {
    fileLoaderCalled = true;
    expect(widgetName).toEqual('file-widget');
    return Promise.resolve({ html: '<div>Loaded from file</div>' });
  };

  const result = await resolveWidgetTags(html, registry, routeInfo, fileLoader);
  expect(fileLoaderCalled).toEqual(true);
  expect(result).toContain('File content');
});

test('resolveWidgetTags - file loader receives declared files', async () => {
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
  expect(declaredFiles).toEqual(fileWidget.files);
});

/**
 * Test Suite: resolveWidgetTags - Error Handling
 */

test('resolveWidgetTags - widget getData error leaves tag unchanged', async () => {
  const html = '<widget-error-widget></widget-error-widget>';
  const registry = new MockRegistry(new ErrorWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toEqual(html);
});

test('resolveWidgetTags - widget render error leaves tag unchanged', async () => {
  const html = '<widget-render-error></widget-render-error>';
  const registry = new MockRegistry(new RenderErrorWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toEqual(html);
});

test('resolveWidgetTags - error in one widget does not break others', async () => {
  const html =
    '<div><widget-simple></widget-simple><widget-error-widget></widget-error-widget></div>';
  const registry = new MockRegistry(new SimpleWidget(), new ErrorWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Hello Widget');
  expect(result).toContain('<widget-error-widget></widget-error-widget>');
});

test('resolveWidgetTags - file loader error leaves tag unchanged', async () => {
  const html = '<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const fileLoader: WidgetFileLoader = () => {
    throw new Error('File load failed');
  };

  const result = await resolveWidgetTags(html, registry, routeInfo, fileLoader);
  expect(result).toEqual(html);
});

/**
 * Test Suite: resolveWidgetTags - Tag Matching and Content
 */

test('resolveWidgetTags - captures widget name with hyphens', async () => {
  const html = '<widget-param-widget count="5"></widget-param-widget>';
  const registry = new MockRegistry(new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('<widget-param-widget');
});

test('resolveWidgetTags - preserves original attributes in output', async () => {
  const html = '<widget-simple id="my-widget" class="styled"></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('id="my-widget"');
  expect(result).toContain('class="styled"');
});

test('resolveWidgetTags - handles nested angle brackets in content', async () => {
  const html = '<div><widget-simple></widget-simple></div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result.startsWith('<div>')).toEqual(true);
  expect(result.endsWith('</div>')).toEqual(true);
});

test('resolveWidgetTags - replaces widgets from end to preserve indices', async () => {
  const html = '<widget-simple></widget-simple>TEXT<widget-simple></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('TEXT');
  const matches = result.match(/<widget-simple/g);
  expect(matches?.length).toEqual(2);
});

/**
 * Test Suite: resolveWidgetTags - Widget Name Validation
 */

test('resolveWidgetTags - widget names must start with lowercase letter', async () => {
  const html = '<widget-123invalid></widget-123invalid>';
  const registry = new MockRegistry();
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toEqual(html);
});

test('resolveWidgetTags - widget names can contain numbers after first char', async () => {
  const html = '<widget-widget2></widget-widget2>';
  const registry = new MockRegistry(new Widget2());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Hello Widget');
});

/**
 * Test Suite: resolveWidgetTags - Attribute Edge Cases
 */

test('resolveWidgetTags - empty attribute value', async () => {
  const html = '<widget-simple attr=""></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('attr=""');
});

test('resolveWidgetTags - attribute with only spaces', async () => {
  const html = '<widget-simple attr="   "></widget-simple>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('attr=');
});

test('resolveWidgetTags - self-closing widget tag syntax not matched', async () => {
  const html = '<widget-simple />';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toEqual(html);
});

/**
 * Test Suite: Complex Scenarios
 */

test('resolveWidgetTags - concurrent widget resolution', async () => {
  const html =
    '<widget-simple></widget-simple><widget-param-widget count="5"></widget-param-widget>';
  const registry = new MockRegistry(new SimpleWidget(), new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Hello Widget');
  expect(result).toContain('Anonymous: 5');
});

test('resolveWidgetTags - widget with all attribute quote styles', async () => {
  const customWidget = new (class extends ParamWidget {
    override getData({ params }: { params: Record<string, string>; context: ComponentContext }) {
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
  expect(result).toContain('sum: 18');
});

test('resolveWidgetTags - very long HTML document with multiple widgets', async () => {
  const long = '<div>' + '<widget-simple></widget-simple>'.repeat(10) + '</div>';
  const registry = new MockRegistry(new SimpleWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(long, registry, routeInfo);
  const matches = result.match(/<widget-simple/g);
  expect(matches?.length).toEqual(10);
  expect(result).toContain('Hello Widget');
});

test('resolveWidgetTags - whitespace around widget tags', async () => {
  const html = `
    <widget-simple></widget-simple>
    <widget-param-widget count="5"></widget-param-widget>
  `;
  const registry = new MockRegistry(new SimpleWidget(), new ParamWidget());
  const routeInfo = createTestRouteInfo();

  const result = await resolveWidgetTags(html, registry, routeInfo);
  expect(result).toContain('Hello Widget');
  expect(result).toContain('Anonymous: 5');
});

/**
 * Test Suite: Nested Widget Resolution
 */

test('resolveWidgetTags - nested widgets are resolved', async () => {
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
  expect(result).toContain('Outer:');
  expect(result).toContain('<span>Inner</span>');
  expect(result.includes(' ssr ') || result.includes(' ssr>')).toBeTruthy();
});

test('resolveWidgetTags - deeply nested widgets (3 levels)', async () => {
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
  expect(result).toContain('Level 1:');
  expect(result).toContain('Level 2:');
  expect(result).toContain('<span>Level 3</span>');
});

test('resolveWidgetTags - nested widgets with params', async () => {
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

  expect(result).toContain('Card');
  expect(result).toContain('Count: 42');
});

test('resolveWidgetTags - max depth limit prevents infinite loops', async () => {
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
  expect(result).toBeDefined();
  expect(result).toContain('widget-recursive');
});

/**
 * Test Suite: parseAttrsToParams Edge Cases
 */

test('parseAttrsToParams - JSON array parsed', () => {
  expect(parseAttrsToParams("items='[1,2,3]'")).toEqual({ items: [1, 2, 3] });
});

test('parseAttrsToParams - nested JSON object', () => {
  expect(parseAttrsToParams('config=\'{"user":{"name":"Alice"}}\'')).toEqual({
    config: { user: { name: 'Alice' } },
  });
});

test('parseAttrsToParams - attribute with dash at start requires quotes', () => {
  expect(parseAttrsToParams('-attr="value"')).toEqual({ attr: 'value' });
});

test('parseAttrsToParams - multiple consecutive spaces between attributes', () => {
  expect(parseAttrsToParams('a="1" b="2"')).toEqual({ a: 1, b: 2 });
});

test('parseAttrsToParams - attributes separated by space', () => {
  expect(parseAttrsToParams('x="100" y="200"')).toEqual({ x: 100, y: 200 });
});
