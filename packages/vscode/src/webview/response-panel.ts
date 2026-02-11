import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { ExecutionResult } from '../execution/types';
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

  show(result: ExecutionResult, profile?: string): void {
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
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside, false);
    }

    const nonce = createNonce();
    this.panel.title = `t-req: ${result.request.method} ${result.request.url}`;
    this.panel.webview.html = renderResponseHtml(result, {
      nonce,
      cspSource: this.panel.webview.cspSource,
      profile
    });
    this.output.appendLine(
      `[panel] rendered mode=${result.mode} status=${result.response.status} requestIndex=${result.request.index}`
    );
  }
}
