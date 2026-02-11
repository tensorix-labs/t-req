import * as path from 'node:path';
import * as vscode from 'vscode';

export function getFolderScopeUri(documentUri: vscode.Uri): vscode.Uri {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (workspaceFolder) {
    return workspaceFolder.uri;
  }
  return vscode.Uri.file(path.dirname(documentUri.fsPath));
}
