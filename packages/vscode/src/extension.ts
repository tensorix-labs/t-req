import * as vscode from 'vscode';
import { TreqCommandController } from './commands';
import { TreqCodeLensProvider } from './providers/codelens';
import { TreqDiagnostics } from './providers/diagnostics';
import { TreqDocumentSymbolProvider } from './providers/document-symbols';
import { migrateLegacyProfileState } from './state/profile-state';
import { getFolderScopeUri } from './state/scope';
import { TreqStatusBar } from './status-bar';
import { ResponsePanel } from './webview/response-panel';

let rootDisposable: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const disposables: vscode.Disposable[] = [];
  const output = vscode.window.createOutputChannel('t-req');

  try {
    const migrationScopes = new Map<string, vscode.Uri>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      migrationScopes.set(folder.uri.toString(), folder.uri);
    }
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId !== 'http') {
        continue;
      }
      const folderUri = getFolderScopeUri(document.uri);
      migrationScopes.set(folderUri.toString(), folderUri);
    }

    const migrated = await migrateLegacyProfileState(context.workspaceState, [
      ...migrationScopes.values()
    ]);
    if (migrated) {
      output.appendLine('[extension] migrated legacy profile selection to scoped profile storage');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[extension] profile migration warning: ${message}`);
  }

  const panel = new ResponsePanel(context.extensionUri, output);
  const diagnostics = new TreqDiagnostics(context, output);

  let commands: TreqCommandController | undefined;
  const statusBar = new TreqStatusBar((documentUri, executionMode, defaultProfile) =>
    commands?.getSelectedProfile(documentUri, executionMode, defaultProfile)
  );
  commands = new TreqCommandController(context, output, statusBar, diagnostics, panel);

  const codeLens = new TreqCodeLensProvider();
  const symbols = new TreqDocumentSymbolProvider();

  disposables.push(output, panel, diagnostics, statusBar, commands);
  disposables.push(vscode.languages.registerCodeLensProvider({ language: 'http' }, codeLens));
  disposables.push(vscode.languages.registerDocumentSymbolProvider({ language: 'http' }, symbols));

  disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'http') {
        codeLens.refresh();
      }
    })
  );
  disposables.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === 'http') {
        codeLens.refresh();
      }
    })
  );
  disposables.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('t-req')) {
        statusBar.refresh();
        codeLens.refresh();
      }
    })
  );
  disposables.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      statusBar.refresh();
      diagnostics.refreshVisibleDocuments();
    })
  );
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      statusBar.setActiveEditor(editor);
    })
  );

  statusBar.setActiveEditor(vscode.window.activeTextEditor);
  rootDisposable = vscode.Disposable.from(...disposables);
  context.subscriptions.push(rootDisposable);

  output.appendLine('[extension] activated');
}

export function deactivate(): void {
  rootDisposable?.dispose();
  rootDisposable = undefined;
}
