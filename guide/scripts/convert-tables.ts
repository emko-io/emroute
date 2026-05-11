#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * One-shot converter: rewrites GFM pipe tables in *.page.md files
 * under guide/routes/ into emkoma's fenced `table` JSON blocks.
 *
 * GFM input:
 *   | Header | Other |
 *   |--------|------:|
 *   | a      | b     |
 *
 * Emkoma output:
 *   ```table
 *   { "head": ["Header", "Other:"], "body": [["a", "b"]] }
 *   ```
 *
 * Alignment rules:
 *   |:---|         left   (no marker on cell)
 *   |---:|         right  ("text:" suffix)
 *   |:---:|        center (":text:" wrap)
 */

import { walk } from 'jsr:@std/fs@1/walk';

interface Cell {
  text: string;
}

type Align = 'left' | 'center' | 'right';

function splitRow(line: string): string[] {
  // Strip leading/trailing pipe, then split on unescaped pipes.
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      buf += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

function parseAlign(divider: string): Align {
  const d = divider.trim();
  if (d.startsWith(':') && d.endsWith(':')) return 'center';
  if (d.endsWith(':')) return 'right';
  if (d.startsWith(':')) return 'left';
  return 'left';
}

function isDividerRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}

function applyAlign(text: string, align: Align): string {
  if (align === 'center') return `:${text}:`;
  if (align === 'right') return `${text}:`;
  return text; // left = no marker
}

function convertTable(lines: string[]): string {
  // lines[0] = head, lines[1] = divider, lines[2..] = body
  const headCells = splitRow(lines[0]!);
  const dividerCells = splitRow(lines[1]!);
  const alignments = dividerCells.map(parseAlign);

  const head = headCells.map((c, i) => applyAlign(c, alignments[i] ?? 'left'));

  const body: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const row = splitRow(lines[i]!);
    // pad/truncate to head length
    while (row.length < head.length) row.push('');
    body.push(row.slice(0, head.length));
  }

  const json = JSON.stringify(
    body.length > 0 ? { head, body } : { head },
    null,
    2,
  );

  return '```table\n' + json + '\n```';
}

function convertFile(content: string): { result: string; count: number } {
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  let count = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    // Skip inside fenced code blocks — don't touch their content.
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fence = fenceMatch[1]!;
      out.push(line);
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence)) {
        out.push(lines[i]!);
        i++;
      }
      if (i < lines.length) {
        out.push(lines[i]!);
        i++;
      }
      continue;
    }

    // Detect start of a GFM table: a line starting with `|` followed by a divider row.
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      isDividerRow(splitRow(lines[i + 1]!))
    ) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim().startsWith('|') &&
        lines[i]!.trim().endsWith('|')
      ) {
        tableLines.push(lines[i]!);
        i++;
      }
      if (tableLines.length >= 2 && isDividerRow(splitRow(tableLines[1]!))) {
        out.push(convertTable(tableLines));
        count++;
        continue;
      }
      // Not a table — emit as-is.
      out.push(...tableLines);
      continue;
    }

    out.push(line);
    i++;
  }

  return { result: out.join('\n'), count };
}

const root = new URL('../routes/', import.meta.url).pathname;
let totalTables = 0;
let totalFiles = 0;

for await (const entry of walk(root, { exts: ['.md'] })) {
  if (!entry.isFile) continue;
  if (!entry.name.endsWith('.page.md')) continue;
  const text = await Deno.readTextFile(entry.path);
  const { result, count } = convertFile(text);
  if (count > 0) {
    await Deno.writeTextFile(entry.path, result);
    totalTables += count;
    totalFiles++;
    console.log(`${count}  ${entry.path.replace(root, '')}`);
  }
}

console.log(`\nConverted ${totalTables} tables across ${totalFiles} files.`);
