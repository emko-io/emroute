#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Convert "**`path/to/file.ext`**" labels that precede code fences
 * into emkoma's inline fence filepath syntax:
 *
 *   **`routes/about.page.md`**
 *
 *   ```md
 *   # About
 *   ```
 *
 * becomes:
 *
 *   ```md filepath=routes/about.page.md
 *   # About
 *   ```
 *
 * Skips bold path labels that aren't followed by a code fence.
 */

import { walk } from 'jsr:@std/fs@1/walk';

const root = new URL('../routes/', import.meta.url).pathname;

const labelPattern = /^\*\*`([^`]+)`\*\*\s*$/;

function quoteIfNeeded(s: string): string {
  return s.includes(' ') ? `"${s}"` : s;
}

function processFile(text: string): { result: string; count: number } {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  let count = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const m = line.match(labelPattern);
    if (!m) {
      out.push(line);
      i++;
      continue;
    }

    // Look ahead past blank lines for a code fence
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() === '') j++;

    const fenceMatch = j < lines.length ? lines[j]!.match(/^(`{3,})(.*)$/) : null;
    if (!fenceMatch) {
      out.push(line);
      i++;
      continue;
    }

    const fence = fenceMatch[1]!;
    const rest = fenceMatch[2]!.trim();
    const filepath = m[1]!;

    // Don't double-add if filepath is already there
    if (/\bfilepath=/.test(rest)) {
      out.push(line);
      i++;
      continue;
    }

    // Build new fence line. Preserve existing info string (language + meta).
    const newInfo = rest
      ? `${rest} filepath=${quoteIfNeeded(filepath)}`
      : `filepath=${quoteIfNeeded(filepath)}`;
    const newFence = `${fence}${newInfo}`;

    // Skip the label line and blank lines, emit the new fence
    out.push(newFence);
    i = j + 1;
    count++;
  }

  return { result: out.join('\n'), count };
}

let totalLabels = 0;
let totalFiles = 0;
for await (const entry of walk(root, { exts: ['.md'] })) {
  if (!entry.isFile || !entry.name.endsWith('.page.md')) continue;
  const text = await Deno.readTextFile(entry.path);
  const { result, count } = processFile(text);
  if (count > 0) {
    await Deno.writeTextFile(entry.path, result);
    totalLabels += count;
    totalFiles++;
    console.log(`${count}  ${entry.path.replace(root, '')}`);
  }
}
console.log(`\nInlined ${totalLabels} filepath labels across ${totalFiles} files.`);
