/**
 * resolveWidgetTags — contextProvider parameter Tests
 */

import { assertEquals } from '@std/assert';
import { Component } from '../../src/component/abstract.component.ts';
import type { ComponentContext, ContextProvider } from '../../src/component/abstract.component.ts';
import type { RouteInfo } from '../../src/type/route.type.ts';
import { resolveWidgetTags } from '../../src/util/widget-resolve.util.ts';

// ============================================================================
// Fixtures
// ============================================================================

class SpyWidget extends Component<Record<string, unknown>, Record<string, unknown>> {
  readonly name = 'test';
  getDataContext: unknown = null;

  override getData(args: this['DataArgs']): Promise<Record<string, unknown>> {
    this.getDataContext = args.context;
    return Promise.resolve({ value: 'data' });
  }

  renderMarkdown(): string {
    return '';
  }

  override renderHTML(): string {
    return '<span>test</span>';
  }
}

function createRouteInfo(): RouteInfo {
  return {
    pathname: '/page',
    pattern: '/page',
    params: {},
    searchParams: new URLSearchParams(),
  };
}

function createRegistry(widget: Component) {
  return { get: (name: string) => (name === 'test' ? widget : undefined) };
}

const HTML_WITH_WIDGET = '<widget-test coin="bitcoin"></widget-test>';

// ============================================================================
// Tests
// ============================================================================

Deno.test('resolveWidgetTags - passes contextProvider to widget getData', async () => {
  const widget = new SpyWidget();

  const contextProvider: ContextProvider = (base) => ({ ...base, custom: 'value' });

  await resolveWidgetTags(
    HTML_WITH_WIDGET,
    createRegistry(widget),
    createRouteInfo(),
    undefined,
    contextProvider,
  );

  const captured = widget.getDataContext as Record<string, unknown>;
  assertEquals(captured.custom, 'value');
  assertEquals(captured.pathname, '/page');
});

Deno.test('resolveWidgetTags - works without contextProvider', async () => {
  const widget = new SpyWidget();

  await resolveWidgetTags(
    HTML_WITH_WIDGET,
    createRegistry(widget),
    createRouteInfo(),
  );

  const captured = widget.getDataContext as Record<string, unknown>;
  assertEquals(captured.pathname, '/page');
  assertEquals(Object.prototype.hasOwnProperty.call(captured, 'custom'), false);
});

Deno.test('resolveWidgetTags - contextProvider receives base context with loaded files', async () => {
  const widget = new SpyWidget();
  let receivedBase: ComponentContext | null = null;

  const contextProvider: ContextProvider = (base) => {
    receivedBase = base;
    return base;
  };

  await resolveWidgetTags(
    HTML_WITH_WIDGET,
    createRegistry(widget),
    createRouteInfo(),
    () => Promise.resolve({ html: '<p>loaded</p>', md: undefined, css: undefined }),
    contextProvider,
  );

  assertEquals(receivedBase !== null, true);
  assertEquals(receivedBase!.pathname, '/page');
  assertEquals(receivedBase!.files?.html, '<p>loaded</p>');
});
