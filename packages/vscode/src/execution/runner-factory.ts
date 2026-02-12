import type * as vscode from 'vscode';
import type { ExtensionSettings } from '../config/loader';
import { createLocalRunner } from './local-runner';
import { createServerRunner } from './server-runner';
import type { ExecutionRunner } from './types';

export function createRunner(settings: ExtensionSettings, serverToken?: string): ExecutionRunner {
  if (settings.executionMode === 'server') {
    if (!settings.serverUrl) {
      throw new Error('t-req.serverUrl is required when execution mode is set to server.');
    }

    try {
      new URL(settings.serverUrl);
    } catch {
      throw new Error(`Invalid t-req.serverUrl: ${settings.serverUrl}`);
    }

    const token = serverToken?.trim();
    if (!token) {
      throw new Error(
        't-req server token is required when execution mode is set to server. Run "t-req: Set Server Token".'
      );
    }

    return createServerRunner(settings.serverUrl, token);
  }

  return createLocalRunner();
}

export function scopeLabel(scope: vscode.ConfigurationScope): string {
  if (scope && 'fsPath' in scope) {
    return scope.fsPath;
  }
  return 'workspace';
}
