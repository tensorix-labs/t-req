import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { parseEditorDocument } from '../document-parser';

export class TreqCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  refresh(): void {
    this.changeEmitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== 'http') {
      return [];
    }

    try {
      const parsed = parseEditorDocument(document);
      const lenses: vscode.CodeLens[] = [];

      if (parsed.requests.length > 1) {
        const range = new vscode.Range(0, 0, 0, 0);
        lenses.push(
          new vscode.CodeLens(range, {
            title: `$(run-all) Run All (${parsed.requests.length} requests)`,
            command: COMMANDS.RUN_ALL_REQUESTS,
            arguments: [document.uri]
          })
        );
      }

      for (const request of parsed.requests) {
        const range = new vscode.Range(request.methodLine, 0, request.methodLine, 0);
        lenses.push(
          new vscode.CodeLens(range, {
            title: '$(play) Run Request',
            command: COMMANDS.RUN_REQUEST,
            arguments: [document.uri, request.index]
          })
        );
      }

      return lenses;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[t-req] failed to provide CodeLens: ${message}`);
      return [];
    }
  }
}
