import { describe, expect, test } from 'bun:test';
import type { ExecutionResult } from '../../src/execution/types';
import { highlightJson, isAssertSummaryReport, renderResponseHtml } from '../../src/webview/render';

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

describe('webview render', () => {
  test('renders pretty JSON body with syntax highlighting', () => {
    const html = renderResponseHtml(makeResult(), {
      nonce: 'nonce',
      cspSource: 'vscode-webview://test'
    });

    expect(html).toContain('<span class="json-key">&quot;ok&quot;</span>');
    expect(html).toContain('<span class="json-bool">true</span>');
    expect(html).toContain('Body');
    expect(html).toContain('Headers');
    expect(html).toContain('Plugins');
  });

  test('renders assert report summary in plugin tab', () => {
    const html = renderResponseHtml(
      makeResult({
        pluginReports: [
          {
            pluginName: '@t-req/plugin-assert',
            runId: 'run_1',
            ts: 1,
            seq: 1,
            data: {
              kind: 'assert',
              passed: false,
              total: 2,
              failed: 1,
              checks: [
                { expression: 'status == 200', passed: true, message: 'ok' },
                {
                  expression: 'jsonpath $.ok == true',
                  passed: false,
                  message: 'mismatch',
                  actual: false,
                  expected: true
                }
              ]
            }
          }
        ]
      }),
      {
        nonce: 'nonce',
        cspSource: 'vscode-webview://test'
      }
    );

    expect(html).toContain('1/2 passed');
    expect(html).toContain('status == 200');
    expect(html).toContain('Expected:');
    expect(html).toContain('Actual:');
  });

  test('shows binary notice for base64 response', () => {
    const html = renderResponseHtml(
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
      }),
      {
        nonce: 'nonce',
        cspSource: 'vscode-webview://test'
      }
    );

    expect(html).toContain('Binary payload shown as base64.');
  });

  test('escapes potentially dangerous body content', () => {
    const html = renderResponseHtml(
      makeResult({
        response: {
          status: 200,
          statusText: 'OK',
          headers: [{ name: 'content-type', value: 'text/html' }],
          body: '<script>alert("x")</script><img src=x onload=alert(1)>',
          encoding: 'utf-8',
          contentType: 'text/html',
          bodyBytes: 56,
          truncated: false
        }
      }),
      {
        nonce: 'nonce',
        cspSource: 'vscode-webview://test'
      }
    );

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
  });

  test('renders warnings in plugins tab when enrichment fails', () => {
    const html = renderResponseHtml(
      makeResult({
        warnings: ['Failed to enrich execution details: HTTP 500']
      }),
      {
        nonce: 'nonce',
        cspSource: 'vscode-webview://test'
      }
    );

    expect(html).toContain('1 warning');
    expect(html).toContain('Failed to enrich execution details: HTTP 500');
    expect(html).toContain('(no plugin activity)');
  });

  test('highlightJson wraps each token type', () => {
    const input = JSON.stringify(
      { name: 'alice', age: 30, active: true, deleted: false, note: null },
      null,
      2
    );
    const result = highlightJson(input);

    expect(result).toContain('<span class="json-key">&quot;name&quot;</span>');
    expect(result).toContain('<span class="json-string">&quot;alice&quot;</span>');
    expect(result).toContain('<span class="json-number">30</span>');
    expect(result).toContain('<span class="json-bool">true</span>');
    expect(result).toContain('<span class="json-bool">false</span>');
    expect(result).toContain('<span class="json-null">null</span>');
  });

  test('highlightJson escapes HTML in string values', () => {
    const input = JSON.stringify({ html: '<b>bold</b>' }, null, 2);
    const result = highlightJson(input);

    expect(result).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(result).not.toContain('<b>bold</b>');
  });

  test('assert report type guard detects valid shape', () => {
    const valid = {
      kind: 'assert',
      passed: true,
      total: 1,
      failed: 0,
      checks: []
    };
    const invalid = { kind: 'other', checks: [] };

    expect(isAssertSummaryReport(valid)).toBe(true);
    expect(isAssertSummaryReport(invalid)).toBe(false);
  });
});
