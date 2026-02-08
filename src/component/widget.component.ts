/**
 * Widget — semantic marker for content-author components.
 *
 * Identical runtime behavior to Component.
 * The only difference: widgets register as `<widget-{name}>` custom elements
 * instead of `<c-{name}>`.
 */

import { Component } from './abstract.component.ts';

export abstract class Widget<TParams = unknown, TData = unknown> extends Component<TParams, TData> {
  static readonly tagPrefix = 'widget';
}
