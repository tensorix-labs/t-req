import { describe, expect, test } from 'bun:test';
import type { ExecutionResult } from '../../src/execution/types';
import { formatBodyContent, safeJsonStringify } from '../../src/webview/utils/body';
import { escapeHtml, formatBytes, formatDuration } from '../../src/webview/utils/format';
import { highlightJson } from '../../src/webview/utils/json-highlight';

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    mode: 'local',
    request: {
      index: 0,
      method: 'GET',
      url: 'https://example.test'
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: [{ name: 'content-type', value: 'application/json' }],
      body: '{"ok":true}',
      encoding: 'utf-8',
      contentType: 'application/json',
      bodyBytes: 11,
      truncated: false
    },
    timing: {
      startTime: 10,
      endTime: 25,
      durationMs: 15
    },
    pluginHooks: [],
    pluginReports: [],
    warnings: [],
    ...overrides
  };
}

describe('webview format utils', () => {
  test('escapes HTML-sensitive characters', () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;'
    );
  });

  test('formats durations for ms and seconds', () => {
    expect(formatDuration(12.34)).toBe('12.3ms');
    expect(formatDuration(1234)).toBe('1.23s');
  });

  test('formats bytes across thresholds', () => {
    expect(formatBytes(1000)).toBe('1000 B');
    expect(formatBytes(4096)).toBe('4.0 KB');
  });

  test('safeJsonStringify handles unserializable values', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(safeJsonStringify(circular)).toBe('[unserializable]');
  });
});

describe('webview body utils', () => {
  test('formats and highlights JSON response body', () => {
    const output = formatBodyContent(makeResult());
    expect(output.highlighted).toBe(true);
    expect(output.content).toContain('json-key');
    expect(output.badge).toBe('application/json');
  });

  test('marks base64 payload as binary', () => {
    const output = formatBodyContent(
      makeResult({
        response: {
          status: 200,
          statusText: 'OK',
          headers: [{ name: 'content-type', value: 'application/octet-stream' }],
          body: 'AAE=',
          encoding: 'base64',
          contentType: 'application/octet-stream',
          bodyBytes: 2,
          truncated: false
        }
      })
    );

    expect(output.binary).toBe(true);
    expect(output.highlighted).toBe(false);
    expect(output.badge).toBe('application/octet-stream');
  });
});

describe('json highlighting', () => {
  test('escapes html content inside string values', () => {
    const highlighted = highlightJson(JSON.stringify({ html: '<b>bold</b>' }, null, 2));
    expect(highlighted).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(highlighted).not.toContain('<b>bold</b>');
  });
});
