import { type PluginDiagnostic, parse, parseDocument } from '@t-req/core';
import * as vscode from 'vscode';
import { readSettings, resolveLocalConfig } from '../config/loader';
import { getScopedProfile } from '../state/profile-state';
import { getFolderScopeUri } from '../state/scope';
import { buildValidationVariables } from './validation-variables';

export const DIAGNOSTIC_COLLECTION_NAME = 't-req';

type RangeLike = {
  start: { line: number; column: number };
  end: { line: number; column: number };
};

type StaticDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  range: RangeLike;
};

type BlockInfo = {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  content: string;
};

const VALID_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'CONNECT'
]);

const METHOD_TYPOS: Record<string, string> = {
  DELTE: 'DELETE',
  DELEET: 'DELETE',
  DELET: 'DELETE',
  PSOT: 'POST',
  POTS: 'POST',
  POSTT: 'POST',
  GTE: 'GET',
  GTT: 'GET',
  GETT: 'GET',
  PUY: 'PUT',
  PUTT: 'PUT',
  PTCH: 'PATCH',
  PTACH: 'PATCH',
  PACTH: 'PATCH',
  OPTINOS: 'OPTIONS',
  OPTOINS: 'OPTIONS'
};

const CODES = {
  UNCLOSED_VARIABLE: 'unclosed-variable',
  EMPTY_VARIABLE: 'empty-variable',
  MISSING_URL: 'missing-url',
  INVALID_METHOD: 'invalid-method',
  DUPLICATE_HEADER: 'duplicate-header',
  MALFORMED_HEADER: 'malformed-header',
  NO_VALID_REQUESTS: 'no-valid-requests',
  MALFORMED_BLOCK: 'malformed-request-block',
  CONFIG_RESOLVE: 'config-resolve'
} as const;

function getLinePositions(content: string): number[] {
  const positions: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      positions.push(i + 1);
    }
  }
  return positions;
}

function offsetToPosition(
  offset: number,
  linePositions: number[]
): { line: number; column: number } {
  let line = 0;
  for (let i = 0; i < linePositions.length; i++) {
    const lineStart = linePositions[i];
    if (lineStart === undefined) continue;
    if (lineStart > offset) break;
    line = i;
  }
  const lineStart = linePositions[line] ?? 0;
  return { line, column: Math.max(0, offset - lineStart) };
}

function createRange(startOffset: number, endOffset: number, linePositions: number[]): RangeLike {
  return {
    start: offsetToPosition(startOffset, linePositions),
    end: offsetToPosition(endOffset, linePositions)
  };
}

function parseBlocks(content: string): BlockInfo[] {
  const lines = content.split('\n');
  const blocks: BlockInfo[] = [];
  let blockStartLine = 0;
  let blockStartOffset = 0;
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineEnd = currentOffset + line.length;

    if (line.trim().startsWith('###')) {
      if (i > blockStartLine || blockStartOffset < currentOffset) {
        const endOffset = Math.max(blockStartOffset, currentOffset - 1);
        blocks.push({
          startLine: blockStartLine,
          endLine: i - 1,
          startOffset: blockStartOffset,
          endOffset,
          content: content.slice(blockStartOffset, endOffset)
        });
      }
      blockStartLine = i + 1;
      blockStartOffset = lineEnd + 1;
    }

    currentOffset = lineEnd + 1;
  }

  if (blockStartOffset < content.length) {
    blocks.push({
      startLine: blockStartLine,
      endLine: lines.length - 1,
      startOffset: blockStartOffset,
      endOffset: content.length,
      content: content.slice(blockStartOffset)
    });
  }

  return blocks;
}

function firstMeaningfulLine(
  block: BlockInfo
): { line: number; column: number; text: string } | undefined {
  const lines = block.content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    if (/^@[A-Za-z_][\w.]*\s*=/.test(trimmed)) continue;
    return {
      line: block.startLine + i,
      column: line.search(/\S|$/),
      text: trimmed
    };
  }
  return undefined;
}

function checkUnclosedVariables(content: string, linePositions: number[]): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];
  let searchStart = 0;

  // Detect nested/open blocks where '{{' does not resolve to a matching '}}'
  while (true) {
    const nextOpenAbs = content.indexOf('{{', searchStart);
    if (nextOpenAbs === -1) break;

    const afterOpen = content.slice(nextOpenAbs + 2);
    const closePos = afterOpen.indexOf('}}');
    const nextOpen = afterOpen.indexOf('{{');

    if (closePos === -1 || (nextOpen !== -1 && nextOpen < closePos)) {
      diagnostics.push({
        severity: 'error',
        code: CODES.UNCLOSED_VARIABLE,
        message: 'Unclosed variable reference - missing }}',
        range: createRange(nextOpenAbs, nextOpenAbs + 2, linePositions)
      });
    }

    searchStart = nextOpenAbs + 2;
    if (searchStart >= content.length) break;
  }

  return diagnostics;
}

function checkEmptyVariables(content: string, linePositions: number[]): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];
  const regex = /\{\{\s*\}\}/g;
  let match: RegExpExecArray | null = regex.exec(content);
  while (match !== null) {
    diagnostics.push({
      severity: 'warning',
      code: CODES.EMPTY_VARIABLE,
      message: 'Empty variable reference',
      range: createRange(match.index, match.index + match[0].length, linePositions)
    });
    match = regex.exec(content);
  }
  return diagnostics;
}

function checkMissingUrl(content: string, linePositions: number[]): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];
  const lines = content.split('\n');
  let currentOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@') || trimmed.includes(':')) {
      currentOffset += line.length + 1;
      continue;
    }

    const methodMatch = trimmed.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\b/i);
    if (methodMatch) {
      const afterMethod = trimmed.slice(methodMatch[0].length).trim();
      if (!afterMethod) {
        const methodStart = currentOffset + line.indexOf(methodMatch[0]);
        diagnostics.push({
          severity: 'error',
          code: CODES.MISSING_URL,
          message: `Missing URL after ${methodMatch[0]} method`,
          range: createRange(methodStart, methodStart + methodMatch[0].length, linePositions)
        });
      }
    }

    currentOffset += line.length + 1;
  }

  return diagnostics;
}

function checkInvalidMethod(content: string, linePositions: number[]): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];
  const lines = content.split('\n');
  let currentOffset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
      currentOffset += line.length + 1;
      continue;
    }

    if (/^[\w-]+:\s/.test(trimmed)) {
      currentOffset += line.length + 1;
      continue;
    }

    const wordMatch = trimmed.match(/^([A-Z]{2,10})\s+\S/);
    if (wordMatch) {
      const maybeMethod = wordMatch[1];
      if (maybeMethod && !VALID_METHODS.has(maybeMethod)) {
        const suggestion = METHOD_TYPOS[maybeMethod];
        const methodStart = currentOffset + line.indexOf(maybeMethod);
        diagnostics.push({
          severity: 'warning',
          code: CODES.INVALID_METHOD,
          message: suggestion
            ? `Invalid HTTP method '${maybeMethod}' - did you mean '${suggestion}'?`
            : `Invalid HTTP method '${maybeMethod}'`,
          range: createRange(methodStart, methodStart + maybeMethod.length, linePositions)
        });
      }
    }

    currentOffset += line.length + 1;
  }

  return diagnostics;
}

function checkDuplicateHeaders(content: string, linePositions: number[]): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];
  const blocks = parseBlocks(content);

  for (const block of blocks) {
    const blockLines = block.content.split('\n');
    const headers = new Map<string, { line: number }>();
    let lineOffset = block.startOffset;
    let inBody = false;

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i] ?? '';
      const trimmed = line.trim();

      if (!trimmed) {
        inBody = true;
        lineOffset += line.length + 1;
        continue;
      }

      if (
        inBody ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('@') ||
        /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(trimmed)
      ) {
        lineOffset += line.length + 1;
        continue;
      }

      const headerMatch = trimmed.match(/^([^:]+):\s*.*/);
      if (headerMatch) {
        const headerName = headerMatch[1]?.toLowerCase();
        if (headerName) {
          const existing = headers.get(headerName);
          if (existing) {
            const headerStart = lineOffset + (line.indexOf(headerMatch[1] ?? '') || 0);
            diagnostics.push({
              severity: 'warning',
              code: CODES.DUPLICATE_HEADER,
              message: `Duplicate header '${headerMatch[1]}' (first defined on line ${existing.line + 1})`,
              range: createRange(
                headerStart,
                headerStart + (headerMatch[1]?.length ?? 0),
                linePositions
              )
            });
          } else {
            headers.set(headerName, {
              line: block.startLine + i
            });
          }
        }
      }

      lineOffset += line.length + 1;
    }
  }

  return diagnostics;
}

function checkMalformedHeaders(content: string, linePositions: number[]): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];
  const blocks = parseBlocks(content);

  for (const block of blocks) {
    const blockLines = block.content.split('\n');
    let lineOffset = block.startOffset;
    let inBody = false;
    let sawRequestLine = false;

    for (const line of blockLines) {
      const trimmed = line.trim();

      if (!trimmed) {
        if (sawRequestLine) inBody = true;
        lineOffset += line.length + 1;
        continue;
      }

      if (inBody || trimmed.startsWith('#') || trimmed.startsWith('@')) {
        lineOffset += line.length + 1;
        continue;
      }

      if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(trimmed)) {
        sawRequestLine = true;
        lineOffset += line.length + 1;
        continue;
      }

      if (sawRequestLine && !trimmed.includes(':')) {
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('<')) {
          diagnostics.push({
            severity: 'error',
            code: CODES.MALFORMED_HEADER,
            message: "Malformed header - missing ':' separator",
            range: createRange(lineOffset, lineOffset + line.length, linePositions)
          });
        }
      }

      lineOffset += line.length + 1;
    }
  }

  return diagnostics;
}

function checkNoValidRequests(content: string): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];

  const hasMeaningfulContent = content.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) return false;
    if (/^@[A-Za-z_][\w.]*\s*=/.test(trimmed)) return false;
    return true;
  });

  if (!hasMeaningfulContent) {
    return diagnostics;
  }

  try {
    const parsed = parseDocument(content);
    if (parsed.requests.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: CODES.NO_VALID_REQUESTS,
        message: 'No valid requests found in file',
        range: {
          start: { line: 0, column: 0 },
          end: { line: 0, column: 1 }
        }
      });
    }
  } catch {
    diagnostics.push({
      severity: 'error',
      code: CODES.NO_VALID_REQUESTS,
      message: 'Failed to parse document',
      range: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 1 }
      }
    });
  }

  return diagnostics;
}

function checkMalformedBlocks(content: string): StaticDiagnostic[] {
  const diagnostics: StaticDiagnostic[] = [];
  const blocks = parseBlocks(content);

  for (const block of blocks) {
    const meaningfulLine = firstMeaningfulLine(block);
    if (!meaningfulLine) continue;
    if (parse(block.content).length > 0) continue;

    diagnostics.push({
      severity: 'warning',
      code: CODES.MALFORMED_BLOCK,
      message: 'Request block could not be parsed',
      range: {
        start: { line: meaningfulLine.line, column: meaningfulLine.column },
        end: {
          line: meaningfulLine.line,
          column: meaningfulLine.column + Math.max(1, meaningfulLine.text.length)
        }
      }
    });
  }

  return diagnostics;
}

function analyzeStaticContent(content: string): StaticDiagnostic[] {
  const linePositions = getLinePositions(content);
  const diagnostics: StaticDiagnostic[] = [];
  diagnostics.push(...checkUnclosedVariables(content, linePositions));
  diagnostics.push(...checkEmptyVariables(content, linePositions));
  diagnostics.push(...checkMissingUrl(content, linePositions));
  diagnostics.push(...checkInvalidMethod(content, linePositions));
  diagnostics.push(...checkDuplicateHeaders(content, linePositions));
  diagnostics.push(...checkMalformedHeaders(content, linePositions));
  diagnostics.push(...checkNoValidRequests(content));
  diagnostics.push(...checkMalformedBlocks(content));

  diagnostics.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.column - b.range.start.column;
  });

  return diagnostics;
}

function toSeverity(severity: StaticDiagnostic['severity']): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'info':
      return vscode.DiagnosticSeverity.Information;
  }
}

function toVscodeDiagnostic(diagnostic: StaticDiagnostic | PluginDiagnostic): vscode.Diagnostic {
  const range = new vscode.Range(
    diagnostic.range.start.line,
    diagnostic.range.start.column,
    diagnostic.range.end.line,
    diagnostic.range.end.column
  );
  const d = new vscode.Diagnostic(range, diagnostic.message, toSeverity(diagnostic.severity));
  d.source = 't-req';
  d.code = diagnostic.code;
  return d;
}

function dedupeDiagnostics(diagnostics: vscode.Diagnostic[]): vscode.Diagnostic[] {
  const seen = new Set<string>();
  const out: vscode.Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.message,
      diagnostic.range.start.line,
      diagnostic.range.start.character,
      diagnostic.range.end.line,
      diagnostic.range.end.character,
      diagnostic.severity
    ].join(':');

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diagnostic);
  }

  return out;
}

export class TreqDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection(
    DIAGNOSTIC_COLLECTION_NAME
  );
  private readonly staticDiagnostics = new Map<string, vscode.Diagnostic[]>();
  private readonly executionDiagnostics = new Map<string, vscode.Diagnostic[]>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {
    this.disposables.push(this.collection);
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'http') {
          void this.refreshDocument(document);
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.languageId === 'http') {
          this.clearDocument(document.uri);
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId !== 'http') {
          return;
        }
        this.scheduleRefresh(event.document);
      })
    );
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === 'http') {
          void this.refreshDocument(document);
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('t-req')) {
          this.refreshVisibleDocuments();
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        this.refreshVisibleDocuments();
      })
    );

    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === 'http') {
        void this.refreshDocument(document);
      }
    }
  }

  dispose(): void {
    for (const timeout of this.pending.values()) {
      clearTimeout(timeout);
    }
    this.pending.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  refreshVisibleDocuments(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId === 'http') {
        void this.refreshDocument(editor.document);
      }
    }
  }

  clearExecutionDiagnostics(uri: vscode.Uri): void {
    this.executionDiagnostics.delete(uri.toString());
    this.publish(uri);
  }

  setExecutionError(uri: vscode.Uri, line: number, message: string): void {
    if (!this.isEnabled(uri)) {
      return;
    }

    const range = new vscode.Range(line, 0, line, 1);
    const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    diagnostic.code = 'execution-error';
    diagnostic.source = 't-req';

    this.executionDiagnostics.set(uri.toString(), [diagnostic]);
    this.publish(uri);
  }

  private isEnabled(scope: vscode.ConfigurationScope): boolean {
    return readSettings(scope).enableDiagnostics;
  }

  private clearDocument(uri: vscode.Uri): void {
    const key = uri.toString();
    this.staticDiagnostics.delete(key);
    this.executionDiagnostics.delete(key);
    this.collection.delete(uri);
  }

  private scheduleRefresh(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timeout = setTimeout(() => {
      this.pending.delete(key);
      void this.refreshDocument(document);
    }, 150);
    this.pending.set(key, timeout);
  }

  async refreshDocument(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'http') {
      return;
    }

    const key = document.uri.toString();
    const scope = vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? document.uri;
    if (!this.isEnabled(scope)) {
      this.staticDiagnostics.delete(key);
      this.executionDiagnostics.delete(key);
      this.collection.delete(document.uri);
      return;
    }

    const content = document.getText();
    const diagnostics: vscode.Diagnostic[] = analyzeStaticContent(content).map(toVscodeDiagnostic);

    const settings = readSettings(scope);
    if (settings.executionMode === 'local' && vscode.workspace.isTrusted) {
      const profile = getScopedProfile(
        this.context.workspaceState,
        getFolderScopeUri(document.uri),
        settings.executionMode,
        settings.defaultProfile
      );
      let resolved: Awaited<ReturnType<typeof resolveLocalConfig>> | undefined;
      try {
        resolved = await resolveLocalConfig(document.uri, profile, this.output);
        const manager = resolved.config.pluginManager;
        if (manager) {
          const linePositions = getLinePositions(content);
          const validateOutput = { diagnostics: [] as PluginDiagnostic[] };
          const hookCtx = manager.createHookContext({
            variables: buildValidationVariables(content, resolved.config.variables)
          });
          await manager.triggerValidate(
            {
              content,
              path: document.uri.fsPath,
              linePositions,
              ctx: hookCtx
            },
            validateOutput
          );
          diagnostics.push(...validateOutput.diagnostics.map(toVscodeDiagnostic));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.output.appendLine(`[diagnostics] config/plugin validation warning: ${message}`);
        const line = 0;
        const col = 0;
        diagnostics.push(
          toVscodeDiagnostic({
            severity: 'warning',
            code: CODES.CONFIG_RESOLVE,
            message: `Config/plugin diagnostics unavailable: ${message}`,
            range: {
              start: { line, column: col },
              end: { line, column: col + 1 }
            }
          })
        );
      } finally {
        try {
          await resolved?.config.pluginManager?.teardown();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.output.appendLine(`[diagnostics] plugin teardown warning: ${message}`);
        }
      }
    }

    const merged = dedupeDiagnostics(diagnostics);
    this.staticDiagnostics.set(key, merged);
    this.publish(document.uri);
  }

  private publish(uri: vscode.Uri): void {
    const key = uri.toString();
    const staticDiagnostics = this.staticDiagnostics.get(key) ?? [];
    const executionDiagnostics = this.executionDiagnostics.get(key) ?? [];
    const merged = dedupeDiagnostics([...staticDiagnostics, ...executionDiagnostics]);
    if (merged.length === 0) {
      this.collection.delete(uri);
      return;
    }
    this.collection.set(uri, merged);
  }
}
