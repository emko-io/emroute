/**
 * Markdown Renderer Interface
 *
 * Implement this to provide custom markdown rendering.
 * Used by MarkdownElement (browser) and SsrHtmlRouter (server).
 */
export interface MarkdownRenderer {
  /**
   * Initialize the renderer (e.g., load WASM).
   * Called once before first render.
   */
  init?(): Promise<void>;

  /**
   * Render markdown to HTML.
   *
   * **Security:** Output is assigned to `innerHTML` — the renderer must
   * sanitize dangerous markup. See `doc/markdown-renderer.md`.
   */
  render(markdown: string): string;
}
