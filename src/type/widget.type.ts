/**
 * Widget System - Type Definitions
 *
 * Widgets are data-fetching components that work across three contexts:
 * 1. /md/ (LLMs) - Returns markdown with JSON data
 * 2. SSR/HTML - Pre-fetched data embedded in custom element
 * 3. SPA/Browser - Custom element fetches and hydrates
 */

/**
 * Parsed widget block from markdown.
 * Represents a fenced code block with widget syntax.
 */
export interface ParsedWidgetBlock {
  /** Full matched string including fences */
  fullMatch: string;

  /** Widget name extracted from widget:{name} */
  widgetName: string;

  /** Parsed JSON params, or null if empty/invalid */
  params: Record<string, unknown> | null;

  /** Parse error message if params JSON was invalid */
  parseError?: string;

  /** Start index in original markdown */
  startIndex: number;

  /** End index in original markdown */
  endIndex: number;
}

/** Custom element tag name for widgets: `widget-{name}` */
export type WidgetTagName = `widget-${string}`;

/**
 * Widget manifest entry for code generation.
 */
export interface WidgetManifestEntry {
  /** Widget name in kebab-case */
  name: string;

  /** Path to widget module file */
  modulePath: string;

  /** Custom element tag name (widget-{name}) */
  tagName: WidgetTagName;

  /** Discovered/declared companion file paths (html, md, css) */
  files?: { html?: string; md?: string; css?: string };
}

/**
 * Generated widgets manifest structure.
 */
export interface WidgetsManifest {
  widgets: WidgetManifestEntry[];

  /** Pre-bundled module loaders keyed by module path (for SPA bundles) */
  moduleLoaders?: Record<string, () => Promise<unknown>>;
}
