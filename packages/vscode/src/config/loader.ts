import * as path from 'node:path';
import type { ResolvedProjectConfig } from '@t-req/core/config';
import { listProfiles, loadConfig, resolveProjectConfig } from '@t-req/core/config';
import { createTreqClient } from '@t-req/sdk/client';
import * as vscode from 'vscode';

export type ExtensionExecutionMode = 'local' | 'server';

export type ExtensionSettings = {
  executionMode: ExtensionExecutionMode;
  serverUrl: string;
  defaultProfile: string;
  timeout: number;
  enableDiagnostics: boolean;
  maxBodyBytes: number;
  experimentalUseSolidRenderer: boolean;
};

export function readSettings(scope?: vscode.ConfigurationScope): ExtensionSettings {
  const config = vscode.workspace.getConfiguration('t-req', scope);
  return {
    executionMode: config.get<ExtensionExecutionMode>('executionMode', 'local'),
    serverUrl: config.get<string>('serverUrl', '').trim(),
    defaultProfile: config.get<string>('defaultProfile', '').trim(),
    timeout: config.get<number>('timeout', 30000),
    enableDiagnostics: config.get<boolean>('enableDiagnostics', true),
    maxBodyBytes: config.get<number>('maxBodyBytes', 1048576),
    experimentalUseSolidRenderer: config.get<boolean>('experimental.useSolidRenderer', false)
  };
}

export function readLegacyServerToken(scope?: vscode.ConfigurationScope): string | undefined {
  const token = vscode.workspace
    .getConfiguration('t-req', scope)
    .get<string>('serverToken', '')
    .trim();
  return token || undefined;
}

export async function clearLegacyServerToken(scope?: vscode.ConfigurationScope): Promise<void> {
  const config = vscode.workspace.getConfiguration('t-req', scope);
  const inspect = config.inspect<string>('serverToken');
  if (!inspect) {
    return;
  }

  const updates: Promise<void>[] = [];
  if (typeof inspect.workspaceFolderValue === 'string' && inspect.workspaceFolderValue.trim()) {
    updates.push(
      Promise.resolve(
        config.update('serverToken', undefined, vscode.ConfigurationTarget.WorkspaceFolder)
      )
    );
  }
  if (typeof inspect.workspaceValue === 'string' && inspect.workspaceValue.trim()) {
    updates.push(
      Promise.resolve(config.update('serverToken', undefined, vscode.ConfigurationTarget.Workspace))
    );
  }
  if (typeof inspect.globalValue === 'string' && inspect.globalValue.trim()) {
    updates.push(
      Promise.resolve(config.update('serverToken', undefined, vscode.ConfigurationTarget.Global))
    );
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

export function getWorkspaceBounds(documentUri: vscode.Uri): { startDir: string; stopDir: string } {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  const stopDir = workspaceFolder?.uri.fsPath ?? path.dirname(documentUri.fsPath);
  const startDir = path.dirname(documentUri.fsPath);
  return { startDir, stopDir };
}

export async function resolveLocalConfig(
  documentUri: vscode.Uri,
  profile: string | undefined,
  output: vscode.OutputChannel
): Promise<ResolvedProjectConfig> {
  const { startDir, stopDir } = getWorkspaceBounds(documentUri);
  output.appendLine(
    `[config] resolve local config startDir=${startDir} stopDir=${stopDir} profile=${profile ?? '(none)'}`
  );
  return await resolveProjectConfig({
    startDir,
    stopDir,
    profile
  });
}

export async function listLocalProfiles(documentUri: vscode.Uri): Promise<string[]> {
  const { startDir, stopDir } = getWorkspaceBounds(documentUri);
  const loaded = await loadConfig({ startDir, stopDir });
  return listProfiles(loaded.config);
}

export async function listServerProfiles(
  serverUrl: string,
  serverToken: string | undefined,
  documentUri: vscode.Uri
): Promise<string[]> {
  const client = createTreqClient({ baseUrl: serverUrl, token: serverToken || undefined });
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  const filePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, documentUri.fsPath).replaceAll(path.sep, '/')
    : undefined;
  const { data, error, response } = await client.getConfig({ query: { path: filePath } });
  if (error) {
    const message =
      (error as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Failed to fetch server profiles: ${message}`);
  }
  return data?.availableProfiles ?? [];
}
