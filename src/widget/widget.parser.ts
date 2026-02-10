/**
 * Widget Parser
 *
 * Parses fenced widget blocks from markdown content.
 *
 * Syntax:
 * ```widget:widget-name
 * {"key": "value"}
 * ```
 */

import type { ParsedWidgetBlock } from '../type/widget.type.ts';

/**
 * Pattern to match widget fenced code blocks.
 * Captures: widget name, params content
 */
const WIDGET_PATTERN = /```widget:(?<name>[a-z][a-z0-9-]*)\n(?<params>.*?)```/gs;

/**
 * Parse all widget blocks from markdown content.
 *
 * @param markdown - Markdown content to parse
 * @returns Array of parsed widget blocks with positions
 */
export function parseWidgetBlocks(markdown: string): ParsedWidgetBlock[] {
  const blocks: ParsedWidgetBlock[] = [];

  for (const match of markdown.matchAll(WIDGET_PATTERN)) {
    const fullMatch = match[0];
    const { name: widgetName, params: paramsRaw } = match.groups!;
    const paramsJson = paramsRaw.trim();
    const startIndex = match.index ?? 0;

    const block: ParsedWidgetBlock = {
      fullMatch,
      widgetName,
      params: null,
      startIndex,
      endIndex: startIndex + fullMatch.length,
    };

    // Parse JSON params if present
    if (paramsJson) {
      try {
        const parsed = JSON.parse(paramsJson);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          block.params = parsed;
        } else {
          block.parseError = 'Params must be a JSON object';
        }
      } catch (e) {
        block.parseError = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      // Empty params is valid - use empty object
      block.params = {};
    }

    blocks.push(block);
  }

  return blocks;
}

/**
 * Replace widget blocks in markdown with rendered content.
 *
 * @param markdown - Original markdown content
 * @param replacements - Map of parsed blocks to replacement strings
 * @returns Markdown with widget blocks replaced
 */
export function replaceWidgetBlocks(
  markdown: string,
  replacements: Map<ParsedWidgetBlock, string>,
): string {
  // Sort blocks by position descending to replace from end first
  // This preserves indices during replacement
  const sortedBlocks = [...replacements.entries()].sort(
    ([a], [b]) => b.startIndex - a.startIndex,
  );

  let result = markdown;
  for (const [block, replacement] of sortedBlocks) {
    result = result.slice(0, block.startIndex) + replacement + result.slice(block.endIndex);
  }

  return result;
}
