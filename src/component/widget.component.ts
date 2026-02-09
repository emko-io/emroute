/**
 * Widget — embeddable unit within page content.
 *
 * Everything reusable that is not a page is a Widget.
 * Widgets render across all contexts (HTML, Markdown, SPA) and are
 * resolved by name via WidgetRegistry.
 *
 * Pages live in the routes manifest. Widgets live in the registry.
 */

import { Component } from './abstract.component.ts';

export abstract class Widget<TParams = unknown, TData = unknown>
  extends Component<TParams, TData> {}
