/**
 * JavaScript codegen utilities.
 */

/** Escape backticks and ${} for safe embedding in a JS template literal. */
export function escapeTemplateLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}
