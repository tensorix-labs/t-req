import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { loadConfig, mergeConfig } from '../src/config';

describe('treq config', () => {
  test('loadConfig returns empty config when not found', async () => {
    const loaded = await loadConfig({
      startDir: import.meta.dir,
      filename: 'nonexistent.config.ts'
    });
    expect(loaded.config).toEqual({});
  });

  test('loadConfig finds treq.config.ts by searching upwards', async () => {
    const tempDir = path.join(import.meta.dir, 'fixtures', 'tmp-config');
    const nestedDir = path.join(tempDir, 'a', 'b');
    await Bun.$`mkdir -p ${nestedDir}`;

    const configPath = path.join(tempDir, 'treq.config.ts');
    await Bun.write(
      configPath,
      `export default {
  variables: { baseUrl: 'https://example.com' },
  defaults: { timeoutMs: 1234, headers: { 'X-Test': '1' } }
};`
    );

    try {
      const loaded = await loadConfig({ startDir: nestedDir });
      expect(loaded.path).toBe(configPath);
      expect(loaded.config.variables?.baseUrl).toBe('https://example.com');
      expect(loaded.config.defaults?.timeoutMs).toBe(1234);
      expect(loaded.config.defaults?.headers?.['X-Test']).toBe('1');
    } finally {
      await Bun.$`rm -rf ${tempDir}`;
    }
  });

  test('mergeConfig merges variables/resolvers/headers with overrides last', () => {
    const merged = mergeConfig({
      defaults: { variables: { a: 1 }, defaults: { headers: { A: '1', B: '1' } } },
      file: { variables: { b: 2 }, defaults: { headers: { B: '2' } } },
      overrides: { variables: { a: 3 }, defaults: { headers: { C: '3' } } }
    });

    expect(merged.variables).toEqual({ a: 3, b: 2 });
    expect(merged.defaults?.headers).toEqual({ A: '1', B: '2', C: '3' });
  });
});
