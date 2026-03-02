/**
 * Widget Types
 */

/** SPA rendering mode. */
export type SpaMode = 'none' | 'leaf' | 'root' | 'only';

/** Widget manifest entry for discovery and registration. */
export interface WidgetManifestEntry {
  name: string;
  modulePath: string;
  tagName: string;
  files?: { html?: string; md?: string; css?: string };
}

/** Full widgets manifest (array, sorted by name). */
export type WidgetsManifest = WidgetManifestEntry[];

/** Parsed widget block from markdown fenced code. */
export interface ParsedWidgetBlock {
  fullMatch: string;
  widgetName: string;
  params: Record<string, unknown> | null;
  parseError?: string;
  startIndex: number;
  endIndex: number;
}
