/**
 * Markdown Renderer Interface
 */

export interface MarkdownRenderer {
  render(markdown: string): string;
  init?(): Promise<void>;
}
