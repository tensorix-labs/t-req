import * as vscode from 'vscode';
import { type ExtensionExecutionMode, readSettings } from './config/loader';
import { COMMANDS } from './constants';
import { isWorkspaceTrusted } from './trust';

type InFlightRequest = {
  method: string;
  url: string;
};

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, Math.max(1, maxChars - 1))}…`;
}

function getServerHost(serverUrl: string): string {
  if (!serverUrl) {
    return 'server';
  }
  try {
    return new URL(serverUrl).host || 'server';
  } catch {
    return 'server';
  }
}

export class TreqStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private activeEditor: vscode.TextEditor | undefined;
  private inFlight: InFlightRequest | undefined;

  constructor(
    private readonly getProfileForScope: (
      documentUri: vscode.Uri,
      executionMode: ExtensionExecutionMode,
      defaultProfile: string
    ) => string | undefined
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
    this.item.command = COMMANDS.SELECT_PROFILE;
    this.item.name = 't-req status';
  }

  dispose(): void {
    this.item.dispose();
  }

  setActiveEditor(editor: vscode.TextEditor | undefined): void {
    this.activeEditor = editor;
    this.refresh();
  }

  setInFlight(request: InFlightRequest): void {
    this.inFlight = request;
    this.refresh();
  }

  clearInFlight(): void {
    this.inFlight = undefined;
    this.refresh();
  }

  refresh(): void {
    const editor = this.activeEditor;
    if (!editor || editor.document.languageId !== 'http') {
      this.item.hide();
      return;
    }

    const scope =
      vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri ?? editor.document.uri;
    const settings = readSettings(scope);
    const profile = this.getProfileForScope(
      editor.document.uri,
      settings.executionMode,
      settings.defaultProfile
    );
    const profileLabel = profile ? ` [${profile}]` : '';

    if (!isWorkspaceTrusted()) {
      this.item.text = '$(shield) t-req: untrusted';
      this.item.tooltip =
        't-req execution and local config/plugin resolution are blocked in untrusted workspaces.';
      this.item.show();
      return;
    }

    if (this.inFlight) {
      const summary = `${this.inFlight.method.toUpperCase()} ${truncate(this.inFlight.url, 52)}`;
      this.item.text = `$(loading~spin) ${summary}`;
      this.item.tooltip = `Running ${this.inFlight.method.toUpperCase()} ${this.inFlight.url}`;
      this.item.show();
      return;
    }

    if (settings.executionMode === 'server') {
      this.item.text = `$(cloud) t-req: ${getServerHost(settings.serverUrl)}${profileLabel}`;
      this.item.tooltip = 't-req execution mode: server';
      this.item.show();
      return;
    }

    this.item.text = `$(terminal) t-req: local${profileLabel}`;
    this.item.tooltip = 't-req execution mode: local';
    this.item.show();
  }
}
