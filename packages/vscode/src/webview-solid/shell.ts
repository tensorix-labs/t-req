import type { ExecutionResult } from '../execution/types';
import { escapeHtml } from '../webview/utils/format';
import type { WebviewBootstrapData } from './types';

type RenderSolidWebviewHtmlOptions = {
  nonce: string;
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  result: ExecutionResult;
  profile?: string;
};

function serializeBootstrapData(data: WebviewBootstrapData): string {
  return JSON.stringify(data)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function renderSolidWebviewHtml(options: RenderSolidWebviewHtmlOptions): string {
  const bootstrapData = serializeBootstrapData({
    result: options.result,
    profile: options.profile
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${options.cspSource} data:; style-src ${options.cspSource}; script-src 'nonce-${options.nonce}' ${options.cspSource};"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>t-req response</title>
  <link rel="stylesheet" href="${escapeHtml(options.styleUri)}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${options.nonce}" type="application/json" id="treq-data">${bootstrapData}</script>
  <script nonce="${options.nonce}" src="${escapeHtml(options.scriptUri)}"></script>
</body>
</html>`;
}
