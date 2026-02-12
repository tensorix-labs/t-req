import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { readSettings } from '../config/loader';
import type { ExecutionResult } from '../execution/types';
import { renderSolidWebviewHtml } from '../webview-solid/shell';
import { renderResponseHtml } from './render';

function createNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export class ResponsePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.OutputChannel
  ) {}

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  show(result: ExecutionResult, profile: string | undefined, documentUri: vscode.Uri): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'treqResponse',
        't-req Response',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.extensionUri]
        }
      );
      this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'logo.png');
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside, false);
    }

    const nonce = createNonce();
    const configurationScope = vscode.workspace.getWorkspaceFolder(documentUri)?.uri ?? documentUri;
    const settings = readSettings(configurationScope);
    const useSolidRenderer = settings.experimentalUseSolidRenderer;

    this.panel.title = `t-req: ${result.request.method} ${result.request.url}`;
    if (useSolidRenderer) {
      const scriptUri = this.panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'entry.js'))
        .toString();
      const styleUri = this.panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'entry.css'))
        .toString();

      this.panel.webview.html = renderSolidWebviewHtml({
        nonce,
        cspSource: this.panel.webview.cspSource,
        scriptUri,
        styleUri,
        result,
        profile
      });
    } else {
      this.panel.webview.html = renderResponseHtml(result, {
        nonce,
        cspSource: this.panel.webview.cspSource,
        profile
      });
    }

    this.output.appendLine(
      `[panel] rendered renderer=${useSolidRenderer ? 'solid' : 'legacy'} mode=${result.mode} status=${result.response.status} requestIndex=${result.request.index}`
    );
  }
}
