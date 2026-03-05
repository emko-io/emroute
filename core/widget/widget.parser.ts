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

const WIDGET_PATTERN = /```widget:(?<name>[a-z][a-z0-9-]*)\n(?<params>.*?)```/gs;

export function parseWidgetBlocks(markdown: string): ParsedWidgetBlock[] {
  const blocks: ParsedWidgetBlock[] = [];

  for (const match of markdown.matchAll(WIDGET_PATTERN)) {
    const fullMatch = match[0];
    const { name: widgetName, params: paramsRaw } = match.groups!;
    const paramsJson = paramsRaw!.trim();
    const startIndex = match.index;

    const block: ParsedWidgetBlock = {
      fullMatch,
      widgetName: widgetName!,
      params: null,
      startIndex,
      endIndex: startIndex + fullMatch.length,
    };

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
      block.params = {};
    }

    blocks.push(block);
  }

  return blocks;
}

export function replaceWidgetBlocks(
  markdown: string,
  replacements: Map<ParsedWidgetBlock, string>,
): string {
  const sortedBlocks = [...replacements.entries()].sort(
    ([a], [b]) => b.startIndex - a.startIndex,
  );

  let result = markdown;
  for (const [block, replacement] of sortedBlocks) {
    result = result.slice(0, block.startIndex) + replacement + result.slice(block.endIndex);
  }

  return result;
}
