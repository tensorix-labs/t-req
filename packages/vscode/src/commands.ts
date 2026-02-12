import * as vscode from 'vscode';
import { shouldAutoRerunAfterTokenUpdate, shouldPromptForAuthRecovery } from './auth/auth-policy';
import { ServerTokenStore } from './auth/server-token-store';
import {
  clearLegacyServerToken,
  type ExtensionExecutionMode,
  listLocalProfiles,
  listServerProfiles,
  readLegacyServerToken,
  readSettings
} from './config/loader';
import { COMMANDS } from './constants';
import { findNearestRequestIndex, parseEditorDocument } from './document-parser';
import { createRunner } from './execution/runner-factory';
import { isServerAuthError } from './execution/server-runner';
import type { DocumentRequest } from './execution/types';
import type { TreqDiagnostics } from './providers/diagnostics';
import { clearScopedProfile, getScopedProfile, setScopedProfile } from './state/profile-state';
import { getFolderScopeUri } from './state/scope';
import type { TreqStatusBar } from './status-bar';
import { requireTrustedWorkspace } from './trust';
import type { ResponsePanel } from './webview/response-panel';

type ActiveExecution = {
  controller: AbortController;
  cancelled: boolean;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  const message = toErrorMessage(error).toLowerCase();
  return message.includes('abort') || message.includes('cancel');
}

export class TreqCommandController implements vscode.Disposable {
  private activeExecution: ActiveExecution | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly tokenStore: ServerTokenStore;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly statusBar: TreqStatusBar,
    private readonly diagnostics: TreqDiagnostics,
    private readonly panel: ResponsePanel
  ) {
    this.tokenStore = new ServerTokenStore(context.secrets, {
      read: readLegacyServerToken,
      clear: clearLegacyServerToken
    });

    this.disposables.push(
      vscode.commands.registerCommand(
        COMMANDS.RUN_REQUEST,
        async (uri?: vscode.Uri, requestIndex?: number) => {
          await this.runRequest(uri, requestIndex);
        }
      )
    );
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.RUN_ALL_REQUESTS, async (uri?: vscode.Uri) => {
        await this.runAllRequests(uri);
      })
    );
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.SELECT_PROFILE, async (uri?: vscode.Uri) => {
        await this.selectProfile(uri);
      })
    );
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.CANCEL_REQUEST, async () => {
        this.cancelActiveExecution();
      })
    );
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.SET_SERVER_TOKEN, async (uri?: vscode.Uri) => {
        await this.setServerToken(uri);
      })
    );
    this.disposables.push(
      vscode.commands.registerCommand(COMMANDS.CLEAR_SERVER_TOKEN, async (uri?: vscode.Uri) => {
        await this.clearServerToken(uri);
      })
    );
  }

  dispose(): void {
    this.cancelActiveExecution();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  getSelectedProfile(
    documentUri: vscode.Uri,
    executionMode: ExtensionExecutionMode,
    defaultProfile = ''
  ): string | undefined {
    return getScopedProfile(
      this.context.workspaceState,
      getFolderScopeUri(documentUri),
      executionMode,
      defaultProfile
    );
  }

  private getConfigurationScope(uri: vscode.Uri): vscode.ConfigurationScope {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri ?? uri;
  }

  private async resolveDocument(
    uri?: vscode.Uri
  ): Promise<{ document: vscode.TextDocument; editor: vscode.TextEditor | undefined } | undefined> {
    if (uri) {
      const document = await vscode.workspace.openTextDocument(uri);
      let editor = vscode.window.visibleTextEditors.find(
        (candidate) => candidate.document.uri.toString() === uri.toString()
      );
      if (!editor) {
        editor = await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: true
        });
      }
      return { document, editor };
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return undefined;
    }
    return { document: activeEditor.document, editor: activeEditor };
  }

  private async promptForServerToken(
    document: vscode.TextDocument,
    serverUrl: string,
    prompt: string,
    title: string
  ): Promise<string | undefined> {
    const token = await vscode.window.showInputBox({
      title,
      prompt,
      placeHolder: `Bearer token for ${serverUrl}`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : 'Token is required.')
    });

    const trimmed = token?.trim();
    if (!trimmed) {
      return undefined;
    }

    const folderUri = getFolderScopeUri(document.uri);
    await this.tokenStore.setToken(
      {
        folderUri,
        serverUrl,
        configurationScope: this.getConfigurationScope(document.uri)
      },
      trimmed
    );
    await clearLegacyServerToken(this.getConfigurationScope(document.uri));
    this.output.appendLine('[commands] server token updated in SecretStorage');
    return trimmed;
  }

  private async resolveServerToken(
    document: vscode.TextDocument,
    settings: ReturnType<typeof readSettings>,
    options: {
      promptOnMissing: boolean;
      reason?: string;
    }
  ): Promise<string | undefined> {
    const scope = this.getConfigurationScope(document.uri);
    const folderUri = getFolderScopeUri(document.uri);

    const token = await this.tokenStore.getToken({
      folderUri,
      serverUrl: settings.serverUrl,
      configurationScope: scope
    });
    if (token) {
      return token;
    }

    if (!options.promptOnMissing) {
      return undefined;
    }

    const reasonSuffix = options.reason ? ` (${options.reason})` : '';
    return await this.promptForServerToken(
      document,
      settings.serverUrl,
      `Enter a t-req server token${reasonSuffix}.`,
      'Set t-req Server Token'
    );
  }

  private async withRunner<T>(
    document: vscode.TextDocument,
    run: (
      runner: ReturnType<typeof createRunner>,
      settings: ReturnType<typeof readSettings>
    ) => Promise<T>
  ): Promise<T | undefined> {
    const scope = this.getConfigurationScope(document.uri);
    const settings = readSettings(scope);
    let runner: ReturnType<typeof createRunner>;

    try {
      let serverToken: string | undefined;
      if (settings.executionMode === 'server') {
        if (!settings.serverUrl) {
          throw new Error('t-req.serverUrl is required when execution mode is set to server.');
        }

        serverToken = await this.resolveServerToken(document, settings, {
          promptOnMissing: true
        });
        if (!serverToken) {
          this.output.appendLine('[commands] server token missing or prompt was cancelled');
          void vscode.window.showWarningMessage(
            'A server token is required in server mode. Run "t-req: Set Server Token" and retry.'
          );
          return undefined;
        }
      }

      runner = createRunner(settings, serverToken);
    } catch (error) {
      const message = toErrorMessage(error);
      this.output.appendLine(`[commands] runner setup failed: ${message}`);

      const actions: string[] = [];
      if (settings.executionMode === 'server' && !settings.serverUrl) {
        actions.push('Open Settings');
      }
      if (settings.executionMode === 'server') {
        actions.push('Set Server Token');
      }

      const selected = await vscode.window.showErrorMessage(message, ...actions);
      if (selected === 'Open Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 't-req.serverUrl');
      }
      if (selected === 'Set Server Token') {
        await this.setServerToken(document.uri);
      }
      return undefined;
    }

    return await run(runner, settings);
  }

  private ensureNoActiveExecution(): boolean {
    if (this.activeExecution) {
      void vscode.window.showWarningMessage('t-req execution already in progress.');
      return false;
    }
    return true;
  }

  private cancelActiveExecution(): void {
    if (!this.activeExecution) {
      void vscode.window.showInformationMessage('No t-req execution is in progress.');
      return;
    }
    this.activeExecution.cancelled = true;
    this.activeExecution.controller.abort();
    this.output.appendLine('[commands] execution cancelled by user');
  }

  private async runRequest(uri?: vscode.Uri, requestIndex?: number): Promise<void> {
    if (!this.ensureNoActiveExecution()) {
      return;
    }

    const resolved = await this.resolveDocument(uri);
    if (!resolved) {
      void vscode.window.showErrorMessage('No active .http editor found.');
      return;
    }

    const { document, editor } = resolved;
    if (document.languageId !== 'http') {
      void vscode.window.showErrorMessage('t-req commands only run on .http/.rest files.');
      return;
    }

    if (!(await requireTrustedWorkspace())) {
      return;
    }

    const parsed = parseEditorDocument(document);
    if (parsed.requests.length === 0) {
      void vscode.window.showWarningMessage('No runnable requests found in this file.');
      return;
    }

    const targetIndex =
      requestIndex ?? findNearestRequestIndex(parsed.requests, editor?.selection.active.line ?? 0);

    const request = parsed.requests.find((item) => item.index === targetIndex);
    if (!request) {
      void vscode.window.showErrorMessage('Unable to find the selected request in this file.');
      return;
    }

    await this.withRunner(document, async (runner, settings) => {
      await this.executeRequests(document, [request], parsed.fileVariables, runner, settings);
    });
  }

  private async runAllRequests(uri?: vscode.Uri): Promise<void> {
    if (!this.ensureNoActiveExecution()) {
      return;
    }

    const resolved = await this.resolveDocument(uri);
    if (!resolved) {
      void vscode.window.showErrorMessage('No active .http editor found.');
      return;
    }

    const { document } = resolved;
    if (document.languageId !== 'http') {
      void vscode.window.showErrorMessage('t-req commands only run on .http/.rest files.');
      return;
    }

    if (!(await requireTrustedWorkspace())) {
      return;
    }

    const parsed = parseEditorDocument(document);
    if (parsed.requests.length === 0) {
      void vscode.window.showWarningMessage('No runnable requests found in this file.');
      return;
    }

    const skippedIndexes: number[] = [];
    const requests: DocumentRequest[] = [];
    for (const request of parsed.requests) {
      if (request.protocol === 'sse') {
        skippedIndexes.push(request.index);
        continue;
      }
      requests.push(request);
    }

    if (requests.length === 0) {
      const skippedLabel =
        skippedIndexes.length > 0
          ? ` All requests were SSE and skipped: ${skippedIndexes.map((index) => index + 1).join(', ')}.`
          : '';
      void vscode.window.showWarningMessage(
        `No HTTP requests were eligible for Run All.${skippedLabel}`
      );
      return;
    }

    await this.withRunner(document, async (runner, settings) => {
      await this.executeRequests(document, requests, parsed.fileVariables, runner, settings);
      if (skippedIndexes.length > 0) {
        void vscode.window.showWarningMessage(
          `Run All skipped SSE requests: ${skippedIndexes.map((index) => index + 1).join(', ')}.`
        );
      }
    });
  }

  private async executeRequests(
    document: vscode.TextDocument,
    requests: DocumentRequest[],
    fileVariables: Record<string, string>,
    runner: ReturnType<typeof createRunner>,
    settings: ReturnType<typeof readSettings>
  ): Promise<void> {
    const profile = this.getSelectedProfile(
      document.uri,
      settings.executionMode,
      settings.defaultProfile
    );
    const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    const controller: ActiveExecution = {
      controller: new AbortController(),
      cancelled: false
    };

    this.activeExecution = controller;
    this.diagnostics.clearExecutionDiagnostics(document.uri);
    this.output.appendLine(
      `[commands] execution started mode=${settings.executionMode} profile=${profile ?? '(default)'} trust=${vscode.workspace.isTrusted}`
    );

    let warningCount = 0;

    try {
      for (const request of requests) {
        if (controller.cancelled) {
          this.output.appendLine('[commands] execution sequence cancelled');
          break;
        }

        this.statusBar.setInFlight({ method: request.method, url: request.url });
        this.output.appendLine(
          `[commands] run request index=${request.index} method=${request.method} url=${request.url}`
        );

        try {
          const result = await runner.run({
            documentUri: document.uri,
            workspaceFolderPath,
            documentText: document.getText(),
            request,
            fileVariables,
            profile,
            timeoutMs: settings.timeout,
            maxBodyBytes: settings.maxBodyBytes,
            signal: controller.controller.signal,
            output: this.output
          });

          this.panel.show(result, profile);
          if (result.warnings.length > 0) {
            warningCount += result.warnings.length;
            for (const warning of result.warnings) {
              this.output.appendLine(`[commands] warning: ${warning}`);
            }
          }
        } catch (error) {
          if (isAbortError(error)) {
            this.output.appendLine('[commands] request aborted');
            break;
          }

          if (settings.executionMode === 'server' && isServerAuthError(error)) {
            const authMessage = `Authentication failed (HTTP ${error.status}): ${error.message}`;
            this.output.appendLine(
              `[commands] server auth failed index=${request.index} status=${error.status}: ${error.message}`
            );
            this.diagnostics.setExecutionError(document.uri, request.methodLine, authMessage);

            const updatedToken = await this.resolveServerToken(document, settings, {
              promptOnMissing: true,
              reason: `HTTP ${error.status}`
            });

            if (updatedToken) {
              if (shouldAutoRerunAfterTokenUpdate()) {
                this.output.appendLine(
                  '[commands] auth policy would auto-rerun, but it is disabled'
                );
              } else {
                void vscode.window.showWarningMessage(
                  't-req server token updated. Re-run the request to continue.'
                );
              }
            } else {
              void vscode.window.showErrorMessage(
                't-req server authentication failed. Set a valid server token and retry.'
              );
            }
            break;
          }

          const message = toErrorMessage(error);
          this.output.appendLine(`[commands] request failed index=${request.index}: ${message}`);
          this.diagnostics.setExecutionError(document.uri, request.methodLine, message);
          void vscode.window.showErrorMessage(
            `t-req request ${request.index + 1} failed: ${message}`
          );
        }
      }

      if (controller.cancelled) {
        void vscode.window.showInformationMessage('t-req execution cancelled.');
      } else if (warningCount > 0) {
        void vscode.window.showWarningMessage(`t-req completed with ${warningCount} warning(s).`);
      }
    } finally {
      this.activeExecution = undefined;
      this.statusBar.clearInFlight();
      this.statusBar.refresh();
      this.output.appendLine('[commands] execution finished');
    }
  }

  private async setServerToken(uri?: vscode.Uri): Promise<void> {
    const resolved = await this.resolveDocument(uri);
    const document = resolved?.document ?? vscode.window.activeTextEditor?.document;
    if (!document) {
      void vscode.window.showErrorMessage('Open an .http file to manage the t-req server token.');
      return;
    }

    const scope = this.getConfigurationScope(document.uri);
    const settings = readSettings(scope);
    if (!settings.serverUrl) {
      void vscode.window.showErrorMessage('Set t-req.serverUrl before setting a server token.');
      await vscode.commands.executeCommand('workbench.action.openSettings', 't-req.serverUrl');
      return;
    }

    const token = await this.promptForServerToken(
      document,
      settings.serverUrl,
      'Enter a t-req server token for this workspace folder and server.',
      'Set t-req Server Token'
    );

    if (!token) {
      return;
    }

    void vscode.window.showInformationMessage('t-req server token saved for this workspace scope.');
  }

  private async clearServerToken(uri?: vscode.Uri): Promise<void> {
    const resolved = await this.resolveDocument(uri);
    const document = resolved?.document ?? vscode.window.activeTextEditor?.document;
    if (!document) {
      void vscode.window.showErrorMessage('Open an .http file to manage the t-req server token.');
      return;
    }

    const scope = this.getConfigurationScope(document.uri);
    const settings = readSettings(scope);
    if (!settings.serverUrl) {
      void vscode.window.showErrorMessage('Set t-req.serverUrl before clearing a server token.');
      await vscode.commands.executeCommand('workbench.action.openSettings', 't-req.serverUrl');
      return;
    }

    await this.tokenStore.clearToken({
      folderUri: getFolderScopeUri(document.uri),
      serverUrl: settings.serverUrl,
      configurationScope: scope
    });
    await clearLegacyServerToken(scope);
    this.output.appendLine('[commands] server token cleared for current workspace scope');
    void vscode.window.showInformationMessage(
      't-req server token cleared for this workspace scope.'
    );
  }

  private async selectProfile(uri?: vscode.Uri): Promise<void> {
    const resolved = await this.resolveDocument(uri);
    const document = resolved?.document ?? vscode.window.activeTextEditor?.document;
    if (!document) {
      void vscode.window.showErrorMessage('Open an .http file to select a t-req profile.');
      return;
    }

    const scope = this.getConfigurationScope(document.uri);
    const settings = readSettings(scope);
    const current = this.getSelectedProfile(
      document.uri,
      settings.executionMode,
      settings.defaultProfile
    );

    let profiles: string[] = [];
    try {
      if (settings.executionMode === 'local') {
        if (!(await requireTrustedWorkspace())) {
          return;
        }
        profiles = await listLocalProfiles(document.uri);
      } else {
        if (!settings.serverUrl) {
          void vscode.window.showErrorMessage(
            'Set t-req.serverUrl before selecting server profiles.'
          );
          await vscode.commands.executeCommand('workbench.action.openSettings', 't-req.serverUrl');
          return;
        }

        const serverToken = await this.resolveServerToken(document, settings, {
          promptOnMissing: true,
          reason: 'required to list server profiles'
        });
        if (!serverToken) {
          void vscode.window.showWarningMessage(
            'A server token is required to load server profiles. Run "t-req: Set Server Token" and retry.'
          );
          return;
        }

        profiles = await listServerProfiles(settings.serverUrl, serverToken, document.uri);
      }
    } catch (error) {
      const message = toErrorMessage(error);
      this.output.appendLine(`[commands] profile load failed: ${message}`);

      if (settings.executionMode === 'server' && shouldPromptForAuthRecovery(error)) {
        await this.resolveServerToken(document, settings, {
          promptOnMissing: true,
          reason: 'server authentication failed while listing profiles'
        });
      }

      void vscode.window.showErrorMessage(`Unable to load profiles: ${message}`);
      return;
    }

    const picks: vscode.QuickPickItem[] = [
      {
        label: '(Use default profile)',
        description: current ? `Current: ${current}` : 'No profile override'
      },
      ...profiles.map((profile) => ({
        label: profile,
        description: profile === current ? 'Current' : undefined
      }))
    ];

    const selected = await vscode.window.showQuickPick(picks, {
      title: 'Select t-req Profile',
      placeHolder: current ?? settings.defaultProfile ?? '(default)'
    });

    if (!selected) {
      return;
    }

    const folderUri = getFolderScopeUri(document.uri);
    if (selected.label === '(Use default profile)') {
      await clearScopedProfile(this.context.workspaceState, folderUri, settings.executionMode);
      this.output.appendLine(
        `[commands] profile selection cleared scope=${folderUri.toString()} mode=${settings.executionMode}`
      );
    } else {
      await setScopedProfile(
        this.context.workspaceState,
        folderUri,
        settings.executionMode,
        selected.label
      );
      this.output.appendLine(
        `[commands] profile selected scope=${folderUri.toString()} mode=${settings.executionMode} profile=${selected.label}`
      );
    }

    this.statusBar.refresh();
    this.diagnostics.refreshVisibleDocuments();
  }
}
