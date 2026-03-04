/**
 * Unit tests for codegen.util.ts
 *
 * Tests cover:
 * - generateMainTs for root mode
 * - generateMainTs for only mode
 * - generateMainTs for leaf mode
 * - Import path handling (custom paths, special characters)
 * - Generated code structure and syntax
 */

import { test, expect, describe } from 'bun:test';
import { generateMainTs } from '../../server/codegen.util.ts';

describe('generateMainTs', () => {
  // --- root mode ---

  test('root mode generates bootEmrouteApp import and call', () => {
    const result = generateMainTs('root', '@emroute');
    expect(result).toContain("import { bootEmrouteApp } from '@emroute/spa'");
    expect(result).toContain('await bootEmrouteApp();');
  });

  test('root mode does not contain bare side-effect import', () => {
    const result = generateMainTs('root', '@emroute');
    // Should NOT have a bare `import '...'` line (that's leaf mode)
    expect(result).not.toMatch(/^import '@emroute\/spa';$/m);
  });

  // --- only mode ---

  test('only mode generates bootEmrouteApp import and call', () => {
    const result = generateMainTs('only', '@emroute');
    expect(result).toContain("import { bootEmrouteApp } from '@emroute/spa'");
    expect(result).toContain('await bootEmrouteApp();');
  });

  test('only mode produces identical output to root mode for same importPath', () => {
    const root = generateMainTs('root', '@emroute');
    const only = generateMainTs('only', '@emroute');
    expect(root).toBe(only);
  });

  // --- leaf mode ---

  test('leaf mode generates bare side-effect import', () => {
    const result = generateMainTs('leaf', '@emroute');
    expect(result).toContain("import '@emroute/spa';");
  });

  test('leaf mode does not contain bootEmrouteApp', () => {
    const result = generateMainTs('leaf', '@emroute');
    expect(result).not.toContain('bootEmrouteApp');
  });

  test('leaf mode does not contain await', () => {
    const result = generateMainTs('leaf', '@emroute');
    expect(result).not.toContain('await');
  });

  // --- import path handling ---

  test('appends /spa to the import path', () => {
    const result = generateMainTs('root', './lib');
    expect(result).toContain("from './lib/spa'");
  });

  test('handles scoped package import path', () => {
    const result = generateMainTs('leaf', '@myorg/emroute');
    expect(result).toContain("import '@myorg/emroute/spa';");
  });

  test('handles relative import path', () => {
    const result = generateMainTs('root', '../node_modules/emroute');
    expect(result).toContain("from '../node_modules/emroute/spa'");
  });

  test('handles import path with trailing content', () => {
    // The function simply concatenates /spa — it trusts the caller
    const result = generateMainTs('root', 'https://cdn.example.com/emroute');
    expect(result).toContain("from 'https://cdn.example.com/emroute/spa'");
  });

  // --- generated code structure ---

  test('generated code contains auto-generated comment', () => {
    const root = generateMainTs('root', '@emroute');
    const leaf = generateMainTs('leaf', '@emroute');
    expect(root).toContain('Auto-generated entry point');
    expect(leaf).toContain('Auto-generated entry point');
  });

  test('generated code contains do-not-edit warning', () => {
    const result = generateMainTs('root', '@emroute');
    expect(result).toContain('do not edit');
  });

  test('generated code ends with a newline', () => {
    const root = generateMainTs('root', '@emroute');
    const leaf = generateMainTs('leaf', '@emroute');
    expect(root.endsWith('\n')).toBe(true);
    expect(leaf.endsWith('\n')).toBe(true);
  });

  test('root mode output is a short snippet (few lines)', () => {
    const result = generateMainTs('root', '@emroute');
    const lines = result.trim().split('\n');
    // Comment + import + blank + await = ~4 lines
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  test('leaf mode output is shorter than root mode', () => {
    const leaf = generateMainTs('leaf', '@emroute');
    const root = generateMainTs('root', '@emroute');
    expect(leaf.length).toBeLessThan(root.length);
  });
});
