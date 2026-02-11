import * as vscode from 'vscode';

export function isWorkspaceTrusted(): boolean {
  return vscode.workspace.isTrusted;
}

export async function requireTrustedWorkspace(): Promise<boolean> {
  if (isWorkspaceTrusted()) {
    return true;
  }

  const action = 'Manage Workspace Trust';
  const selected = await vscode.window.showWarningMessage(
    't-req execution is blocked in untrusted workspaces. Trust this workspace to run requests and resolve config/plugins.',
    action
  );

  if (selected === action) {
    await vscode.commands.executeCommand('workbench.trust.manage');
  }

  return false;
}
