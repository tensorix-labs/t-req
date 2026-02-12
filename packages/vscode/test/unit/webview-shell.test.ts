import { describe, expect, test } from 'bun:test';
import type { ExecutionResult } from '../../src/execution/types';
import { renderSolidWebviewHtml } from '../../src/webview-solid/shell';

function makeResult(body = '{"ok":true}'): ExecutionResult {
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
      body,
      encoding: 'utf-8',
      contentType: 'application/json',
      bodyBytes: body.length,
      truncated: false
    },
    timing: {
      startTime: 10,
      endTime: 25,
      durationMs: 15
    },
    pluginHooks: [],
    pluginReports: [],
    warnings: []
  };
}

describe('solid webview shell', () => {
  test('renders CSP and webview asset URIs', () => {
    const html = renderSolidWebviewHtml({
      nonce: 'nonce123',
      cspSource: 'vscode-webview://test',
      scriptUri: 'vscode-webview-resource://script.js',
      styleUri: 'vscode-webview-resource://entry.css',
      result: makeResult(),
      profile: 'dev'
    });

    expect(html).toContain(`script-src 'nonce-nonce123'`);
    expect(html).toContain('style-src vscode-webview://test;');
    expect(html).toContain('<link rel="stylesheet" href="vscode-webview-resource://entry.css" />');
    expect(html).toContain(
      '<script nonce="nonce123" src="vscode-webview-resource://script.js"></script>'
    );
    expect(html).toContain('id="treq-data"');
    expect(html).toContain('"profile":"dev"');
  });

  test('escapes dangerous script sequence in bootstrap payload', () => {
    const html = renderSolidWebviewHtml({
      nonce: 'nonce123',
      cspSource: 'vscode-webview://test',
      scriptUri: 'vscode-webview-resource://script.js',
      styleUri: 'vscode-webview-resource://entry.css',
      result: makeResult('</script><img src=x onerror=alert(1)>')
    });

    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).not.toContain('</script><img src=x onerror=alert(1)>');
  });
});
