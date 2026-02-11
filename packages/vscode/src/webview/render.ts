import type { ExecutionResult } from '../execution/types';

type AssertCheckReport = {
  expression: string;
  line?: number;
  target?: string;
  operator?: string;
  passed: boolean;
  message: string;
  code?: string;
  actual?: unknown;
  expected?: unknown;
};

type AssertSummaryReport = {
  kind: 'assert';
  passed: boolean;
  total: number;
  failed: number;
  checks: AssertCheckReport[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function detectJson(contentType: string | undefined, value: string): boolean {
  const type = (contentType ?? '').toLowerCase();
  if (type.includes('application/json') || type.endsWith('+json')) {
    return true;
  }
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function formatBodyContent(result: ExecutionResult): {
  content: string;
  badge: string;
  binary: boolean;
} {
  const body = result.response.body;
  const contentType = result.response.contentType ?? '';

  if (!body) {
    return { content: '', badge: contentType || 'none', binary: false };
  }

  if (result.response.encoding === 'base64') {
    return {
      content: body,
      badge: contentType || 'binary',
      binary: true
    };
  }

  if (detectJson(contentType, body)) {
    try {
      return {
        content: JSON.stringify(JSON.parse(body), null, 2),
        badge: contentType || 'json',
        binary: false
      };
    } catch {
      return {
        content: body,
        badge: contentType || 'json',
        binary: false
      };
    }
  }

  return {
    content: body,
    badge: contentType || 'text/plain',
    binary: false
  };
}

function bodyBadgeClass(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('json')) return 'badge-json';
  if (type.includes('html')) return 'badge-html';
  if (type.includes('xml')) return 'badge-xml';
  return 'badge-text';
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'status-success';
  if (status >= 300 && status < 400) return 'status-redirect';
  if (status >= 400) return 'status-error';
  return 'status-neutral';
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return '[unserializable]';
  }
}

export function isAssertSummaryReport(data: unknown): data is AssertSummaryReport {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const record = data as Record<string, unknown>;
  return record.kind === 'assert' && Array.isArray(record.checks);
}

function renderAssertReport(report: AssertSummaryReport): string {
  const passed = report.total - report.failed;
  const summaryClass = report.failed === 0 ? 'assert-pass' : 'assert-fail';
  const rows = report.checks
    .map((check) => {
      const line = check.line !== undefined ? `line ${check.line}` : '';
      const actual = check.actual !== undefined ? safeJsonStringify(check.actual) : '';
      const expected = check.expected !== undefined ? safeJsonStringify(check.expected) : '';

      return `<div class="assert-row ${check.passed ? 'assert-pass' : 'assert-fail'}">
        <div class="assert-main">
          <span class="assert-icon">${check.passed ? 'PASS' : 'FAIL'}</span>
          <span class="assert-expression">${escapeHtml(check.expression)}</span>
          ${line ? `<span class="muted">${escapeHtml(line)}</span>` : ''}
        </div>
        <div class="muted">${escapeHtml(check.message || '')}</div>
        ${
          !check.passed && (actual || expected)
            ? `<div class="assert-values">
                ${
                  expected
                    ? `<div><span class="muted">Expected:</span> <code>${escapeHtml(expected)}</code></div>`
                    : ''
                }
                ${actual ? `<div><span class="muted">Actual:</span> <code>${escapeHtml(actual)}</code></div>` : ''}
              </div>`
            : ''
        }
      </div>`;
    })
    .join('\n');

  return `<div class="assert-report">
    <div class="assert-summary ${summaryClass}">${passed}/${report.total} passed</div>
    ${rows}
  </div>`;
}

function renderPluginsTab(result: ExecutionResult): string {
  const byPlugin = new Map<
    string,
    {
      hooks: ExecutionResult['pluginHooks'];
      reports: ExecutionResult['pluginReports'];
    }
  >();

  for (const hook of result.pluginHooks) {
    const existing = byPlugin.get(hook.pluginName) ?? { hooks: [], reports: [] };
    existing.hooks.push(hook);
    byPlugin.set(hook.pluginName, existing);
  }

  for (const report of result.pluginReports) {
    const existing = byPlugin.get(report.pluginName) ?? { hooks: [], reports: [] };
    existing.reports.push(report);
    byPlugin.set(report.pluginName, existing);
  }

  const warningsHtml =
    result.warnings.length > 0
      ? `<div class="warning-group">
          ${result.warnings
            .map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`)
            .join('\n')}
        </div>`
      : '';

  if (byPlugin.size === 0) {
    if (warningsHtml) {
      return `${warningsHtml}<div class="empty">(no plugin activity)</div>`;
    }
    return '<div class="empty">(no plugins active)</div>';
  }

  const sections: string[] = [];
  for (const [pluginName, data] of byPlugin.entries()) {
    const hooksHtml = data.hooks.length
      ? `<div class="plugin-subsection">
          ${data.hooks
            .map((hook) => {
              return `<div class="plugin-hook">
                <span>${escapeHtml(hook.hook)}</span>
                <span class="muted">+${hook.durationMs.toFixed(1)}ms</span>
                ${hook.modified ? '<span class="hook-modified">(mod)</span>' : ''}
              </div>`;
            })
            .join('\n')}
        </div>`
      : '<div class="muted">No hooks executed</div>';

    const reportsHtml = data.reports.length
      ? `<div class="plugin-subsection">
          ${data.reports
            .map((report) => {
              const title = `report seq:${report.seq}${report.requestName ? ` req:${report.requestName}` : ''}`;
              if (isAssertSummaryReport(report.data)) {
                return `<div class="plugin-report">
                  <div class="muted">${escapeHtml(title)}</div>
                  ${renderAssertReport(report.data)}
                </div>`;
              }
              return `<div class="plugin-report">
                <div class="muted">${escapeHtml(title)}</div>
                <pre>${escapeHtml(safeJsonStringify(report.data))}</pre>
              </div>`;
            })
            .join('\n')}
        </div>`
      : '<div class="muted">No plugin reports</div>';

    sections.push(`<section class="plugin-group">
      <h3>${escapeHtml(pluginName)}</h3>
      ${hooksHtml}
      ${reportsHtml}
    </section>`);
  }

  return `${warningsHtml}${sections.join('\n')}`;
}

export function renderResponseHtml(
  result: ExecutionResult,
  options: { nonce: string; cspSource: string; profile?: string }
): string {
  const statusCode = result.response.status;
  const statusText = result.response.statusText || '';
  const durationLabel = formatDuration(result.timing.durationMs);
  const ttfbLabel =
    result.timing.ttfb !== undefined ? `TTFB ${formatDuration(result.timing.ttfb)}` : '';
  const sizeLabel = formatBytes(result.response.bodyBytes);
  const modeLabel = result.mode;
  const profileLabel = options.profile ? `profile:${options.profile}` : '';
  const warningLabel =
    result.warnings.length > 0
      ? `${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`
      : '';

  const { content: bodyContent, badge: bodyBadge, binary } = formatBodyContent(result);
  const bodyNotice = binary ? '<div class="notice">Binary payload shown as base64.</div>' : '';
  const bodyTruncated = result.response.truncated
    ? '<div class="notice">Body truncated by t-req.maxBodyBytes.</div>'
    : '';
  const bodyHtml = bodyContent
    ? `<pre>${escapeHtml(bodyContent)}</pre>`
    : '<div class="empty">No response body</div>';

  const setCookies = result.response.headers.filter(
    (header) => header.name.toLowerCase() === 'set-cookie'
  );
  const otherHeaders = result.response.headers.filter(
    (header) => header.name.toLowerCase() !== 'set-cookie'
  );

  const headersHtml = `
    ${
      setCookies.length > 0
        ? `<section>
            <h3>Set-Cookie</h3>
            <table>
              <tbody>
                ${setCookies
                  .map(
                    (header) =>
                      `<tr><th>${escapeHtml(header.name)}</th><td>${escapeHtml(header.value)}</td></tr>`
                  )
                  .join('\n')}
              </tbody>
            </table>
          </section>`
        : ''
    }
    <section>
      <h3>Headers</h3>
      ${
        otherHeaders.length === 0
          ? '<div class="empty">No headers</div>'
          : `<table>
              <tbody>
                ${otherHeaders
                  .map(
                    (header) =>
                      `<tr><th>${escapeHtml(header.name)}</th><td>${escapeHtml(header.value)}</td></tr>`
                  )
                  .join('\n')}
              </tbody>
            </table>`
      }
    </section>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${options.cspSource} data:; style-src 'nonce-${options.nonce}'; script-src 'nonce-${options.nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>t-req response</title>
  <style nonce="${options.nonce}">
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font: 13px/1.45 var(--vscode-font-family);
    }
    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-sideBar-background);
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 2px 8px;
      font-weight: 600;
      border: 1px solid transparent;
    }
    .status-success {
      color: #1f7a39;
      border-color: color-mix(in srgb, #1f7a39 40%, transparent);
      background: color-mix(in srgb, #1f7a39 16%, transparent);
    }
    .status-redirect {
      color: #8a6700;
      border-color: color-mix(in srgb, #8a6700 40%, transparent);
      background: color-mix(in srgb, #8a6700 16%, transparent);
    }
    .status-error {
      color: #b42318;
      border-color: color-mix(in srgb, #b42318 40%, transparent);
      background: color-mix(in srgb, #b42318 16%, transparent);
    }
    .status-neutral {
      color: var(--vscode-editor-foreground);
      border-color: var(--vscode-editorWidget-border);
      background: transparent;
    }
    .tag {
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      padding: 1px 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .warning-tag {
      border-color: color-mix(in srgb, #b45309 40%, transparent);
      color: #b45309;
      background: color-mix(in srgb, #b45309 10%, transparent);
    }
    .tabs {
      display: flex;
      gap: 8px;
      padding: 10px 12px 6px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editor-background);
    }
    .tab-btn {
      appearance: none;
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-editor-foreground);
      padding: 4px 8px;
      cursor: pointer;
    }
    .tab-btn.active {
      border-color: var(--vscode-button-background);
      background: color-mix(in srgb, var(--vscode-button-background) 15%, transparent);
    }
    .tab-content {
      display: none;
      flex: 1;
      overflow: auto;
      padding: 10px 12px;
    }
    .tab-content.active {
      display: block;
    }
    .badge {
      display: inline-flex;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .badge-json { background: color-mix(in srgb, #7c3aed 18%, transparent); color: #7c3aed; }
    .badge-html { background: color-mix(in srgb, #b42318 18%, transparent); color: #b42318; }
    .badge-xml { background: color-mix(in srgb, #1f7a39 18%, transparent); color: #1f7a39; }
    .badge-text { background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent); color: var(--vscode-foreground); }
    pre {
      margin: 0;
      padding: 10px;
      overflow: auto;
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-sideBar-background));
      font: 12px/1.45 var(--vscode-editor-font-family);
      white-space: pre-wrap;
      word-break: break-word;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      text-align: left;
      vertical-align: top;
    }
    th {
      width: 26%;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
      word-break: break-all;
    }
    td {
      word-break: break-word;
    }
    h3 {
      margin: 12px 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
    }
    .notice {
      margin: 0 0 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .warning-group {
      border: 1px solid color-mix(in srgb, #b45309 35%, transparent);
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 10px;
      background: color-mix(in srgb, #b45309 8%, transparent);
    }
    .warning-item {
      color: #b45309;
      font-size: 12px;
      margin: 2px 0;
    }
    .plugin-group {
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .plugin-group > h3 {
      margin-top: 0;
    }
    .plugin-hook {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 2px 0;
    }
    .plugin-subsection {
      margin-bottom: 8px;
    }
    .hook-modified {
      color: #1f7a39;
      font-weight: 600;
    }
    .assert-report {
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 8px;
      padding: 8px;
      margin-top: 6px;
    }
    .assert-summary {
      font-weight: 700;
      margin-bottom: 6px;
    }
    .assert-row {
      border-top: 1px solid var(--vscode-editorWidget-border);
      padding-top: 6px;
      margin-top: 6px;
    }
    .assert-main {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .assert-icon {
      font-size: 11px;
      font-weight: 700;
      border-radius: 999px;
      padding: 1px 6px;
      border: 1px solid currentColor;
    }
    .assert-expression {
      font-family: var(--vscode-editor-font-family);
      word-break: break-word;
    }
    .assert-values {
      margin-top: 4px;
      display: grid;
      gap: 2px;
    }
    .assert-pass {
      color: #1f7a39;
    }
    .assert-fail {
      color: #b42318;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="summary">
      <span class="status ${statusClass(statusCode)}">
        <span>${statusCode}</span>
        <span>${escapeHtml(statusText)}</span>
      </span>
      <span class="tag">${escapeHtml(durationLabel)}</span>
      ${ttfbLabel ? `<span class="tag">${escapeHtml(ttfbLabel)}</span>` : ''}
      <span class="tag">${escapeHtml(sizeLabel)}${result.response.truncated ? ' (truncated)' : ''}</span>
      <span class="tag">${escapeHtml(modeLabel)}</span>
      ${profileLabel ? `<span class="tag">${escapeHtml(profileLabel)}</span>` : ''}
      ${warningLabel ? `<span class="tag warning-tag">${escapeHtml(warningLabel)}</span>` : ''}
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="body">Body</button>
      <button class="tab-btn" data-tab="headers">Headers</button>
      <button class="tab-btn" data-tab="plugins">Plugins</button>
    </div>
    <section class="tab-content active" data-content="body">
      <span class="badge ${bodyBadgeClass(bodyBadge)}">${escapeHtml(bodyBadge)}</span>
      ${bodyNotice}
      ${bodyTruncated}
      ${bodyHtml}
    </section>
    <section class="tab-content" data-content="headers">
      ${headersHtml}
    </section>
    <section class="tab-content" data-content="plugins">
      ${renderPluginsTab(result)}
    </section>
  </div>
  <script nonce="${options.nonce}">
    (() => {
      const buttons = Array.from(document.querySelectorAll('.tab-btn'));
      const tabs = Array.from(document.querySelectorAll('.tab-content'));

      function activate(tabName) {
        for (const button of buttons) {
          const active = button.dataset.tab === tabName;
          button.classList.toggle('active', active);
        }
        for (const tab of tabs) {
          const active = tab.dataset.content === tabName;
          tab.classList.toggle('active', active);
        }
      }

      for (const button of buttons) {
        button.addEventListener('click', () => activate(button.dataset.tab));
      }

      document.addEventListener('keydown', (event) => {
        if (event.key === '1') activate('body');
        if (event.key === '2') activate('headers');
        if (event.key === '3') activate('plugins');
      });
    })();
  </script>
</body>
</html>`;
}
