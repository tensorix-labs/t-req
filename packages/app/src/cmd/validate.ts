import { statSync } from 'node:fs';
import { relative } from 'node:path';
import { type PluginManager, parseDocument } from '@t-req/core';
import { resolveProjectConfig } from '@t-req/core/config';
import type { CommandModule } from 'yargs';
import { analyzeParsedContent, DiagnosticCodes, getLinePositions } from '../server/diagnostics';
import type { Diagnostic } from '../server/schemas';
import { DEFAULT_WORKSPACE_IGNORE_PATTERNS } from '../server/service/types';
import {
  ANSI,
  dirname,
  existsSync,
  isAbsolute,
  resolve,
  resolveWorkspaceRoot,
  useColor
} from '../utils';

interface ValidateOptions {
  path: string;
  json?: boolean;
  verbose?: boolean;
}

type FileResult = {
  path: string;
  diagnostics: Diagnostic[];
  requestCount: number;
};

type ValidateResult = {
  files: FileResult[];
  summary: {
    filesScanned: number;
    filesWithErrors: number;
    filesWithWarnings: number;
    totalErrors: number;
    totalWarnings: number;
    totalInfos: number;
  };
};

export const validateBuilder = {
  path: {
    type: 'string' as const,
    describe: 'Path to .http file or directory',
    demandOption: true
  },
  json: {
    type: 'boolean' as const,
    describe: 'Output diagnostics as JSON',
    default: false
  },
  verbose: {
    type: 'boolean' as const,
    describe: 'Show files with no issues',
    default: false
  }
};

export const validateCommand: CommandModule<object, ValidateOptions> = {
  command: 'validate <path>',
  describe: 'Validate .http files for syntax errors and diagnostics',
  builder: validateBuilder,
  handler: async (argv) => {
    await runValidate(argv);
  }
};

function discoverHttpFiles(dirPath: string): string[] {
  const glob = new Bun.Glob('**/*.http');
  const files: string[] = [];

  for (const match of glob.scanSync({ cwd: dirPath, absolute: true })) {
    // Skip ignored directories
    const relPath = relative(dirPath, match);
    const segments = relPath.split('/');
    if (segments.some((s) => DEFAULT_WORKSPACE_IGNORE_PATTERNS.includes(s))) {
      continue;
    }
    files.push(match);
  }

  return files.sort();
}

function checkFileReferences(
  content: string,
  filePath: string,
  requests: ReturnType<typeof parseDocument>['requests']
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const fileDir = dirname(filePath);
  const lines = content.split('\n');

  for (const request of requests) {
    if (request.bodyFile) {
      const refPath = request.bodyFile.path;
      const absoluteRef = isAbsolute(refPath) ? refPath : resolve(fileDir, refPath);

      if (!existsSync(absoluteRef)) {
        const lineInfo = findFileReferenceLine(lines, refPath, '< ');
        diagnostics.push({
          severity: 'error',
          code: DiagnosticCodes.FILE_REFERENCE_NOT_FOUND,
          message: `File reference not found: ${refPath}`,
          range: {
            start: { line: lineInfo.line, column: lineInfo.column },
            end: { line: lineInfo.line, column: lineInfo.column + refPath.length }
          }
        });
      }
    }

    if (request.formData) {
      for (const field of request.formData) {
        if (field.isFile && field.path) {
          const refPath = field.path;
          const absoluteRef = isAbsolute(refPath) ? refPath : resolve(fileDir, refPath);

          if (!existsSync(absoluteRef)) {
            const lineInfo = findFileReferenceLine(lines, refPath, '@');
            diagnostics.push({
              severity: 'error',
              code: DiagnosticCodes.FORM_FILE_NOT_FOUND,
              message: `Form file reference not found: ${refPath}`,
              range: {
                start: { line: lineInfo.line, column: lineInfo.column },
                end: { line: lineInfo.line, column: lineInfo.column + refPath.length }
              }
            });
          }
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Find the line containing a file reference by matching the marker+path pattern.
 * Body file refs use `< ./path`, form file refs use `@./path`.
 */
function findFileReferenceLine(
  lines: string[],
  refPath: string,
  marker: string
): { line: number; column: number } {
  const pattern = `${marker}${refPath}`;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const patternIdx = line.indexOf(pattern);
    if (patternIdx !== -1) {
      // Point the diagnostic at the path, not the marker
      const column = patternIdx + marker.length;
      return { line: i, column };
    }
  }
  // Fallback: match path alone (handles whitespace variations)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const idx = line.indexOf(refPath);
    if (idx !== -1) {
      return { line: i, column: idx };
    }
  }
  return { line: 0, column: 0 };
}

async function validateFile(
  filePath: string,
  basePath: string,
  pluginManager?: PluginManager
): Promise<FileResult> {
  const content = await Bun.file(filePath).text();
  const relPath = relative(basePath, filePath);

  // Run text-based diagnostics
  const diagnostics = analyzeParsedContent(content);

  // Parse document for structural checks
  let requestCount = 0;
  try {
    const { requests } = parseDocument(content);
    requestCount = requests.length;

    // Check file references exist on disk
    const fileRefDiagnostics = checkFileReferences(content, filePath, requests);
    diagnostics.push(...fileRefDiagnostics);
  } catch {
    // If parsing fails entirely, we still have the text-based diagnostics
  }

  // Run plugin validate hooks
  if (pluginManager) {
    const linePositions = getLinePositions(content);
    const hookCtx = pluginManager.createHookContext({});
    const validateOutput = { diagnostics: [] as Diagnostic[] };
    await pluginManager.triggerValidate(
      { content, path: filePath, linePositions, ctx: hookCtx },
      validateOutput
    );
    diagnostics.push(...validateOutput.diagnostics);
  }

  // Sort all diagnostics by position
  diagnostics.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.column - b.range.start.column;
  });

  return { path: relPath, diagnostics, requestCount };
}

function severityLabel(severity: Diagnostic['severity'], color: boolean): string {
  if (!color) return severity === 'warning' ? 'warn' : severity;
  switch (severity) {
    case 'error':
      return `${ANSI.red}error${ANSI.reset}`;
    case 'warning':
      return `${ANSI.yellow}warn${ANSI.reset}`;
    case 'info':
      return `${ANSI.blue}info${ANSI.reset}`;
  }
}

export function formatDiagnosticLine(d: Diagnostic, color: boolean): string {
  const pos = `${d.range.start.line + 1}:${d.range.start.column + 1}`;
  const sev = severityLabel(d.severity, color);
  const displaySev = d.severity === 'warning' ? 'warn' : d.severity;
  const posWidth = 8;
  const sevWidth = 7;
  const paddedPos = pos.padEnd(posWidth);
  const paddedSev = color
    ? sev + ' '.repeat(Math.max(0, sevWidth - displaySev.length))
    : displaySev.padEnd(sevWidth);
  return `  ${paddedPos}${paddedSev}${d.code.padEnd(24)}${d.message}`;
}

export function formatSummary(result: ValidateResult): string {
  const { summary } = result;
  const parts: string[] = [];

  const errorWord = summary.totalErrors === 1 ? 'error' : 'errors';
  const warningWord = summary.totalWarnings === 1 ? 'warning' : 'warnings';

  parts.push(`${summary.totalErrors} ${errorWord}`);
  parts.push(`${summary.totalWarnings} ${warningWord}`);

  const fileCount = summary.filesWithErrors + summary.filesWithWarnings;
  if (fileCount > 0) {
    const fileWord = fileCount === 1 ? 'file' : 'files';
    parts.push(`in ${fileCount} ${fileWord}`);
  }

  return `${parts.join(', ')} (${summary.filesScanned} ${summary.filesScanned === 1 ? 'file' : 'files'} scanned)`;
}

export async function runValidate(argv: ValidateOptions): Promise<void> {
  // Resolve path
  let targetPath = argv.path;
  if (!isAbsolute(targetPath)) {
    targetPath = resolve(process.cwd(), targetPath);
  }

  // Check path exists
  if (!existsSync(targetPath)) {
    console.error(`Path not found: ${argv.path}`);
    process.exit(1);
  }

  // Discover files
  let filePaths: string[];
  let basePath: string;
  let stat: ReturnType<typeof statSync>;

  try {
    stat = statSync(targetPath);
  } catch {
    console.error(`Cannot access path: ${argv.path}`);
    process.exit(1);
    return; // unreachable, but helps TS
  }

  if (stat.isDirectory()) {
    basePath = targetPath;
    filePaths = discoverHttpFiles(targetPath);
  } else {
    if (!targetPath.endsWith('.http')) {
      console.error(`Not an .http file: ${argv.path}`);
      process.exit(1);
    }
    basePath = dirname(targetPath);
    filePaths = [targetPath];
  }

  if (filePaths.length === 0) {
    console.error(`No .http files found in: ${argv.path}`);
    process.exit(0);
  }

  // Load plugins for validate hooks
  const workspaceRoot = resolveWorkspaceRoot();
  const { config } = await resolveProjectConfig({
    startDir: basePath,
    stopDir: workspaceRoot
  });
  const pluginManager = config.pluginManager;

  // Validate all files
  const fileResults: FileResult[] = [];
  for (const fp of filePaths) {
    fileResults.push(await validateFile(fp, basePath, pluginManager));
  }

  // Aggregate summary
  const summary = {
    filesScanned: fileResults.length,
    filesWithErrors: 0,
    filesWithWarnings: 0,
    totalErrors: 0,
    totalWarnings: 0,
    totalInfos: 0
  };

  for (const fr of fileResults) {
    let hasError = false;
    let hasWarning = false;
    for (const d of fr.diagnostics) {
      switch (d.severity) {
        case 'error':
          summary.totalErrors++;
          hasError = true;
          break;
        case 'warning':
          summary.totalWarnings++;
          hasWarning = true;
          break;
        case 'info':
          summary.totalInfos++;
          break;
      }
    }
    if (hasError) summary.filesWithErrors++;
    if (hasWarning) summary.filesWithWarnings++;
  }

  const result: ValidateResult = { files: fileResults, summary };

  // Output
  if (argv.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const color = useColor();

    for (const fr of fileResults) {
      if (fr.diagnostics.length === 0 && !argv.verbose) continue;

      if (color) {
        console.log(`${ANSI.bold}${fr.path}${ANSI.reset}`);
      } else {
        console.log(fr.path);
      }

      for (const d of fr.diagnostics) {
        console.log(formatDiagnosticLine(d, color));
      }

      if (fr.diagnostics.length === 0) {
        console.log('  No issues found');
      }

      console.log('');
    }

    // Summary to stderr so JSON mode stdout stays clean
    console.error(formatSummary(result));
  }

  process.exit(summary.totalErrors > 0 ? 1 : 0);
}
