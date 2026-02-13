import { mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { serializeDocument } from '@t-req/core';
import { parseJsonc } from '@t-req/core/config';
import type { ImportDiagnostic, ImportResult } from '@t-req/core/import';
import {
  contains,
  dirname,
  existsSync,
  isAbsolute,
  isPathSafe,
  realpathSync,
  resolve
} from '../../utils';
import { PathOutsideWorkspaceError, ValidationError } from '../errors';
import type { ServiceContext } from './types';

export type ConflictPolicy = 'fail' | 'skip' | 'overwrite' | 'rename';

export interface ApplyImportOptions {
  /** Where to write imported files (relative to workspace root). */
  outputDir: string;
  /** What to do when a file already exists. @default 'fail' */
  onConflict?: ConflictPolicy;
  /** Whether to merge variables into t-req config. @default false */
  mergeVariables?: boolean;
  /** Proceed even if ImportResult has error-severity diagnostics. @default false */
  force?: boolean;
}

export interface ApplyImportResult {
  /** Files that were written. */
  written: string[];
  /** Files that were skipped (conflict policy = skip). */
  skipped: string[];
  /** Files that were renamed (conflict policy = rename). */
  renamed: Array<{ original: string; actual: string }>;
  /** Files that failed to write (only present on partial failure). */
  failed: Array<{ path: string; error: string }>;
  /** Whether variables were merged into config. */
  variablesMerged: boolean;
  /** If variables couldn't be auto-merged (TS/JS config), instructions for manual merge. */
  variableMergeInstructions?: string;
}

/** Thrown when apply partially succeeds. Contains the partial result for deterministic UI handling. */
export class ImportApplyError extends Error {
  constructor(
    message: string,
    public readonly partialResult: ApplyImportResult
  ) {
    super(message);
    this.name = 'ImportApplyError';
  }
}

export interface ImportService {
  preview(result: ImportResult, options: ApplyImportOptions): Promise<ApplyImportResult>;
  apply(result: ImportResult, options: ApplyImportOptions): Promise<ApplyImportResult>;
}

interface NormalizedOptions {
  outputDir: string;
  onConflict: ConflictPolicy;
  mergeVariables: boolean;
  force: boolean;
}

interface PlannedWrite {
  outputRelativePath: string;
  workspaceRelativePath: string;
  absolutePath: string;
  overwrite: boolean;
  document: ImportResult['files'][number]['document'];
}

interface ApplyPlan {
  writes: PlannedWrite[];
  skipped: string[];
  renamed: Array<{ original: string; actual: string }>;
}

interface VariableMergeOutcome {
  variablesMerged: boolean;
  variableMergeInstructions?: string;
}

const CONFIG_CANDIDATES: Array<{
  filename: string;
  format: 'jsonc' | 'json' | 'ts' | 'js' | 'mjs';
}> = [
  { filename: 'treq.jsonc', format: 'jsonc' },
  { filename: 'treq.json', format: 'json' },
  { filename: 'treq.config.ts', format: 'ts' },
  { filename: 'treq.config.js', format: 'js' },
  { filename: 'treq.config.mjs', format: 'mjs' }
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeOutputDir(outputDir: string): string {
  const replaced = outputDir.replaceAll('\\', '/').trim();
  if (replaced === '' || replaced === '.') {
    return '';
  }
  const segments = replaced.split('/').filter((segment) => segment !== '' && segment !== '.');
  return segments.join('/');
}

function normalizeImportRelativePath(relativePath: string): string {
  const replaced = relativePath.replaceAll('\\', '/').trim();
  if (replaced === '') {
    return '';
  }
  const segments = replaced.split('/').filter((segment) => segment !== '' && segment !== '.');
  return segments.join('/');
}

function joinWorkspaceRelative(outputDir: string, outputRelativePath: string): string {
  if (outputDir === '') {
    return outputRelativePath;
  }
  return `${outputDir}/${outputRelativePath}`;
}

function validatePathSafety(context: ServiceContext, requestedPath: string): void {
  if (isPathSafe(context.workspaceRoot, requestedPath)) {
    return;
  }

  if (isAbsolute(requestedPath) || requestedPath.includes('\0')) {
    throw new PathOutsideWorkspaceError(requestedPath);
  }
  const segments = requestedPath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === '..')) {
    throw new PathOutsideWorkspaceError(requestedPath);
  }

  // Fallback for non-existent nested paths. Walk to nearest existing ancestor and verify
  // it resolves inside workspaceRoot.
  let probe = resolve(context.workspaceRoot, requestedPath);
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) {
      throw new PathOutsideWorkspaceError(requestedPath);
    }
    probe = parent;
  }

  const realWorkspace = realpathSync(context.workspaceRoot);
  const realProbe = realpathSync(probe);
  if (!contains(realWorkspace, realProbe)) {
    throw new PathOutsideWorkspaceError(requestedPath);
  }
}

function appendSuffix(relativePath: string, suffix: number): string {
  const ext = path.posix.extname(relativePath);
  const dir = path.posix.dirname(relativePath);
  const basename = ext ? path.posix.basename(relativePath, ext) : path.posix.basename(relativePath);
  const next = `${basename}-${suffix}${ext}`;
  return dir === '.' ? next : `${dir}/${next}`;
}

function resolveOptions(options: ApplyImportOptions): NormalizedOptions {
  return {
    outputDir: normalizeOutputDir(options.outputDir),
    onConflict: options.onConflict ?? 'fail',
    mergeVariables: options.mergeVariables ?? false,
    force: options.force ?? false
  };
}

function getErrorDiagnostics(result: ImportResult): ImportDiagnostic[] {
  return result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

function ensureErrorGating(result: ImportResult, force: boolean): void {
  const errorDiagnostics = getErrorDiagnostics(result);
  if (errorDiagnostics.length === 0 || force) {
    return;
  }

  const lines = errorDiagnostics
    .slice(0, 10)
    .map((diagnostic) => {
      const at = diagnostic.sourcePath ? ` (${diagnostic.sourcePath})` : '';
      return `- [${diagnostic.code}] ${diagnostic.message}${at}`;
    })
    .join('\n');

  throw new ValidationError(
    `Import contains ${errorDiagnostics.length} error diagnostic(s) and cannot be applied without force=true.\n${lines}`
  );
}

async function pathExists(absolutePath: string): Promise<boolean> {
  return await Bun.file(absolutePath).exists();
}

async function allocateRenamePath(
  context: ServiceContext,
  outputDir: string,
  baseOutputRelativePath: string,
  claimedWorkspacePaths: Set<string>
): Promise<{ outputRelativePath: string; workspaceRelativePath: string; absolutePath: string }> {
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextOutputRelativePath = appendSuffix(baseOutputRelativePath, suffix);
    const nextWorkspaceRelativePath = joinWorkspaceRelative(outputDir, nextOutputRelativePath);
    const nextAbsolutePath = resolve(context.workspaceRoot, nextWorkspaceRelativePath);
    if (
      !claimedWorkspacePaths.has(nextWorkspaceRelativePath) &&
      !(await pathExists(nextAbsolutePath))
    ) {
      return {
        outputRelativePath: nextOutputRelativePath,
        workspaceRelativePath: nextWorkspaceRelativePath,
        absolutePath: nextAbsolutePath
      };
    }
    suffix += 1;
  }
}

async function createApplyPlan(
  context: ServiceContext,
  result: ImportResult,
  options: NormalizedOptions
): Promise<ApplyPlan> {
  validatePathSafety(context, options.outputDir === '' ? '.' : options.outputDir);

  const writes: PlannedWrite[] = [];
  const skipped: string[] = [];
  const renamed: Array<{ original: string; actual: string }> = [];
  const claimedWorkspacePaths = new Set<string>();

  for (const file of result.files) {
    const outputRelativePath = normalizeImportRelativePath(file.relativePath);
    if (outputRelativePath === '') {
      throw new ValidationError('Import file has an empty relativePath.');
    }
    if (outputRelativePath.startsWith('/')) {
      throw new PathOutsideWorkspaceError(outputRelativePath);
    }

    const originalWorkspaceRelativePath = joinWorkspaceRelative(
      options.outputDir,
      outputRelativePath
    );
    validatePathSafety(context, originalWorkspaceRelativePath);

    let finalOutputRelativePath = outputRelativePath;
    let finalWorkspaceRelativePath = originalWorkspaceRelativePath;
    let finalAbsolutePath = resolve(context.workspaceRoot, finalWorkspaceRelativePath);

    const existsOnDisk = await pathExists(finalAbsolutePath);
    const claimed = claimedWorkspacePaths.has(finalWorkspaceRelativePath);
    const hasConflict = existsOnDisk || claimed;

    if (hasConflict) {
      if (options.onConflict === 'fail') {
        throw new ValidationError(`File already exists: ${finalWorkspaceRelativePath}`);
      }
      if (options.onConflict === 'skip') {
        skipped.push(finalWorkspaceRelativePath);
        continue;
      }
      if (options.onConflict === 'rename') {
        const allocated = await allocateRenamePath(
          context,
          options.outputDir,
          outputRelativePath,
          claimedWorkspacePaths
        );
        finalOutputRelativePath = allocated.outputRelativePath;
        finalWorkspaceRelativePath = allocated.workspaceRelativePath;
        finalAbsolutePath = allocated.absolutePath;
        renamed.push({
          original: originalWorkspaceRelativePath,
          actual: finalWorkspaceRelativePath
        });
      }
    }

    if (options.onConflict === 'overwrite' && claimed) {
      throw new ValidationError(`Duplicate import target path: ${finalWorkspaceRelativePath}`);
    }

    claimedWorkspacePaths.add(finalWorkspaceRelativePath);
    writes.push({
      outputRelativePath: finalOutputRelativePath,
      workspaceRelativePath: finalWorkspaceRelativePath,
      absolutePath: finalAbsolutePath,
      overwrite: options.onConflict === 'overwrite',
      document: file.document
    });
  }

  return { writes, skipped, renamed };
}

function renderManualMergeInstructions(
  variables: Record<string, unknown>,
  configFilename: string
): string {
  const variableLines = JSON.stringify(variables, null, 2);
  return [
    `Auto-merge is not supported for ${configFilename}.`,
    'Add these variables manually under your config variables block:',
    variableLines
  ].join('\n\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeVariablesPreservingExisting(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): { merged: Record<string, unknown>; addedCount: number } {
  const merged: Record<string, unknown> = { ...existing };
  let addedCount = 0;
  for (const [key, value] of Object.entries(incoming)) {
    if (!(key in merged)) {
      merged[key] = value;
      addedCount += 1;
    }
  }
  return { merged, addedCount };
}

function maybeAddManualMergeDiagnostic(result: ImportResult, configFilename: string): void {
  const existing = result.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === 'config-manual-merge' && diagnostic.details?.['file'] === configFilename
  );
  if (existing) {
    return;
  }
  result.diagnostics.push({
    code: 'config-manual-merge',
    severity: 'info',
    message: `Variables were not auto-merged for ${configFilename}. Manual merge is required.`,
    details: { file: configFilename }
  });
  result.stats = {
    ...result.stats,
    diagnosticCount: result.diagnostics.length
  };
}

async function findConfigFile(workspaceRoot: string): Promise<
  | {
      filename: string;
      format: 'jsonc' | 'json' | 'ts' | 'js' | 'mjs';
      absolutePath: string;
    }
  | undefined
> {
  for (const candidate of CONFIG_CANDIDATES) {
    const absolutePath = resolve(workspaceRoot, candidate.filename);
    if (await pathExists(absolutePath)) {
      return {
        filename: candidate.filename,
        format: candidate.format,
        absolutePath
      };
    }
  }
  return undefined;
}

async function mergeImportVariables(
  context: ServiceContext,
  result: ImportResult,
  options: NormalizedOptions,
  previewOnly: boolean
): Promise<VariableMergeOutcome> {
  if (!options.mergeVariables) {
    return { variablesMerged: false };
  }

  const incomingVariables = result.variables;
  if (Object.keys(incomingVariables).length === 0) {
    return { variablesMerged: false };
  }

  const configFile = await findConfigFile(context.workspaceRoot);
  if (!configFile) {
    const configPath = resolve(context.workspaceRoot, 'treq.jsonc');
    const content = `${JSON.stringify({ variables: incomingVariables }, null, 2)}\n`;
    if (!previewOnly) {
      await writeFile(configPath, content, 'utf-8');
    }
    return { variablesMerged: true };
  }

  if (configFile.format === 'ts' || configFile.format === 'js' || configFile.format === 'mjs') {
    maybeAddManualMergeDiagnostic(result, configFile.filename);
    return {
      variablesMerged: false,
      variableMergeInstructions: renderManualMergeInstructions(
        incomingVariables,
        configFile.filename
      )
    };
  }

  const raw = await readFile(configFile.absolutePath, 'utf-8');
  const parsed = configFile.format === 'jsonc' ? parseJsonc<unknown>(raw) : JSON.parse(raw);
  const configObject = isRecord(parsed) ? { ...parsed } : {};
  const existingVariables = isRecord(configObject['variables'])
    ? ({ ...configObject['variables'] } as Record<string, unknown>)
    : {};

  const merged = mergeVariablesPreservingExisting(existingVariables, incomingVariables);
  if (merged.addedCount === 0) {
    return { variablesMerged: false };
  }

  configObject['variables'] = merged.merged;
  if (!previewOnly) {
    await writeFile(configFile.absolutePath, `${JSON.stringify(configObject, null, 2)}\n`, 'utf-8');
  }

  return { variablesMerged: true };
}

function createBaseResult(plan: ApplyPlan): ApplyImportResult {
  return {
    written: [],
    skipped: [...plan.skipped],
    renamed: [...plan.renamed],
    failed: [],
    variablesMerged: false
  };
}

export function createImportService(context: ServiceContext): ImportService {
  async function preview(
    result: ImportResult,
    options: ApplyImportOptions
  ): Promise<ApplyImportResult> {
    const resolvedOptions = resolveOptions(options);
    ensureErrorGating(result, resolvedOptions.force);

    const plan = await createApplyPlan(context, result, resolvedOptions);
    const mergeOutcome = await mergeImportVariables(context, result, resolvedOptions, true);

    return {
      written: plan.writes.map((write) => write.workspaceRelativePath),
      skipped: plan.skipped,
      renamed: plan.renamed,
      failed: [],
      variablesMerged: mergeOutcome.variablesMerged,
      ...(mergeOutcome.variableMergeInstructions
        ? { variableMergeInstructions: mergeOutcome.variableMergeInstructions }
        : {})
    };
  }

  async function apply(
    result: ImportResult,
    options: ApplyImportOptions
  ): Promise<ApplyImportResult> {
    const resolvedOptions = resolveOptions(options);
    ensureErrorGating(result, resolvedOptions.force);

    const plan = await createApplyPlan(context, result, resolvedOptions);
    const applyResult = createBaseResult(plan);

    const outputAbsolutePath = resolve(context.workspaceRoot, resolvedOptions.outputDir || '.');
    validatePathSafety(context, resolvedOptions.outputDir === '' ? '.' : resolvedOptions.outputDir);

    let stagingAbsolutePath = '';

    if (plan.writes.length > 0) {
      await mkdir(outputAbsolutePath, { recursive: true });
      stagingAbsolutePath = await mkdtemp(path.join(outputAbsolutePath, '.treq-import-staging-'));
    }

    try {
      for (const write of plan.writes) {
        const stagingFilePath = resolve(stagingAbsolutePath, write.outputRelativePath);
        await mkdir(dirname(stagingFilePath), { recursive: true });
        const content = serializeDocument(write.document);
        await writeFile(stagingFilePath, content, 'utf-8');
      }

      for (const write of plan.writes) {
        const stagingFilePath = resolve(stagingAbsolutePath, write.outputRelativePath);
        try {
          await mkdir(dirname(write.absolutePath), { recursive: true });
          if (write.overwrite) {
            await unlink(write.absolutePath).catch(() => undefined);
          }
          await rename(stagingFilePath, write.absolutePath);
          applyResult.written.push(write.workspaceRelativePath);
        } catch (error) {
          applyResult.failed.push({
            path: write.workspaceRelativePath,
            error: errorMessage(error)
          });
        }
      }
    } finally {
      if (plan.writes.length > 0) {
        await rm(stagingAbsolutePath, { recursive: true, force: true });
      }
    }

    if (applyResult.failed.length > 0) {
      throw new ImportApplyError('Import apply completed with partial failures.', applyResult);
    }

    const mergeOutcome = await mergeImportVariables(context, result, resolvedOptions, false);
    applyResult.variablesMerged = mergeOutcome.variablesMerged;
    if (mergeOutcome.variableMergeInstructions) {
      applyResult.variableMergeInstructions = mergeOutcome.variableMergeInstructions;
    }

    return applyResult;
  }

  return {
    preview,
    apply
  };
}
