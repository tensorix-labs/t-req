import * as vscode from 'vscode';
import { parseEditorDocument } from '../document-parser';

export class TreqDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    if (document.languageId !== 'http') {
      return [];
    }

    try {
      const { requests } = parseEditorDocument(document);

      return requests.map((request) => {
        const name = request.name?.trim() ? request.name : `${request.method} ${request.url}`;
        const maxLine = Math.max(0, document.lineCount - 1);
        const separatorLine = request.startLine > 0 ? request.startLine - 1 : request.startLine;
        const boundedSeparatorLine = Math.min(Math.max(separatorLine, 0), maxLine);
        const startsAtSeparator = document
          .lineAt(boundedSeparatorLine)
          .text.trim()
          .startsWith('###');
        const symbolStartLine = startsAtSeparator
          ? boundedSeparatorLine
          : Math.min(Math.max(request.startLine, 0), maxLine);
        const endLine = Math.min(Math.max(request.endLine, 0), maxLine);
        const methodLine = Math.min(Math.max(request.methodLine, 0), maxLine);
        const range = new vscode.Range(
          symbolStartLine,
          0,
          endLine,
          document.lineAt(endLine).text.length
        );
        const selectionRange = new vscode.Range(methodLine, 0, methodLine, 0);

        return new vscode.DocumentSymbol(
          name,
          `Request ${request.index + 1}`,
          vscode.SymbolKind.Function,
          range,
          selectionRange
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[t-req] failed to provide document symbols: ${message}`);
      return [];
    }
  }
}
