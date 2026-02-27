/**
 * Custom Element - Type Definitions
 *
 * Custom elements are plain HTMLElement subclasses auto-discovered from
 * `elementsDir/{name}/{name}.element.ts`. They are registered in the
 * browser via `customElements.define()` during `bootEmrouteApp()`.
 */

/**
 * Custom element manifest entry.
 * Discovered from `elementsDir/{name}/{name}.element.ts`.
 */
export interface ElementManifestEntry {
  /** Element name in kebab-case (must contain a hyphen per web spec) */
  name: string;

  /** Path to element module file */
  modulePath: string;

  /** Custom element tag name (same as name) */
  tagName: string;
}
