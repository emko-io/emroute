/**
 * Component Renderer
 *
 * Renders components in different contexts:
 * - markdown: For /md/* endpoints
 * - html: For /html/* SSR endpoints
 *
 * Handles component trees, slots, and data fetching.
 */

import type {
  Component,
  ComponentContext,
  RenderContext,
} from '../../component/abstract.component.ts';

/**
 * Render a component in the specified context.
 */
export async function renderComponent<TParams, TData>(
  component: Component<TParams, TData>,
  params: TParams,
  context: RenderContext,
  options?: { signal?: AbortSignal; componentContext?: ComponentContext },
): Promise<string> {
  // Validate params
  if (component.validateParams) {
    const error = component.validateParams(params);
    if (error) {
      return context === 'markdown'
        ? component.renderMarkdownError(new Error(error))
        : component.renderError({ error: new Error(error), params });
    }
  }

  try {
    const data = await component.getData({
      params,
      signal: options?.signal,
      context: options?.componentContext,
    });

    if (context === 'markdown') {
      return component.renderMarkdown({ data, params, context: options?.componentContext });
    } else {
      return component.renderHTML({ data, params, context: options?.componentContext });
    }
  } catch (e) {
    return context === 'markdown'
      ? component.renderMarkdownError(e)
      : component.renderError({ error: e, params });
  }
}

/**
 * Parse component blocks from markdown.
 * Syntax: ```component:name\n{params}\n```
 */
export interface ParsedComponentBlock {
  fullMatch: string;
  componentName: string;
  params: Record<string, unknown> | null;
  parseError?: string;
  startIndex: number;
  endIndex: number;
}

const COMPONENT_PATTERN = /```component:([a-z][a-z0-9-]*)\n([\s\S]*?)```/g;

export function parseComponentBlocks(markdown: string): ParsedComponentBlock[] {
  const blocks: ParsedComponentBlock[] = [];

  COMPONENT_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = COMPONENT_PATTERN.exec(markdown)) !== null) {
    const fullMatch = match[0];
    const componentName = match[1];
    const paramsJson = match[2].trim();

    const block: ParsedComponentBlock = {
      fullMatch,
      componentName,
      params: null,
      startIndex: match.index,
      endIndex: match.index + fullMatch.length,
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

/**
 * Replace component blocks with rendered content.
 */
export function replaceComponentBlocks(
  markdown: string,
  replacements: Map<ParsedComponentBlock, string>,
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
