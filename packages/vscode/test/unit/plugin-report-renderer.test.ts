import { describe, expect, test } from 'bun:test';
import { selectPluginReportRenderer } from '../../src/webview-solid/plugin-report-renderer';

describe('plugin report renderer selection', () => {
  test('selects assert renderer for assert summary reports', () => {
    const renderer = selectPluginReportRenderer({
      kind: 'assert',
      passed: true,
      total: 1,
      failed: 0,
      checks: []
    });

    expect(renderer).toBe('assert');
  });

  test('falls back to json renderer for unknown report shapes', () => {
    const renderer = selectPluginReportRenderer({ kind: 'custom', value: 123 });
    expect(renderer).toBe('json');
  });

  test('falls back to json renderer for non-object data', () => {
    expect(selectPluginReportRenderer(null)).toBe('json');
    expect(selectPluginReportRenderer('plain text')).toBe('json');
  });
});
