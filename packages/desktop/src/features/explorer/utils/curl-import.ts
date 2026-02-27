import type {
  CurlImportApplyRequest,
  CurlImportApplyResult,
  CurlImportPreviewRequest,
  CurlImportPreviewResult
} from '@t-req/sdk/client';
import { toCreateDirectory } from './mutations';

export type CurlImportConflictPolicy = NonNullable<
  CurlImportPreviewRequest['planOptions']['onConflict']
>;
export type CurlImportConvertOptions = NonNullable<CurlImportPreviewRequest['convertOptions']>;
export type CurlImportSummary = CurlImportPreviewResult['result'];
export type CurlImportDiagnostics = CurlImportPreviewResult['diagnostics'];
export type CurlImportStats = CurlImportPreviewResult['stats'];

export type CurlImportFormInput = {
  command: string;
  outputDir: string;
  onConflict: CurlImportConflictPolicy;
  fileName: string;
  requestName: string;
  mergeVariables: boolean;
  force: boolean;
};

export type ResolvedCurlImportInput = {
  previewKey: string;
  previewRequest: CurlImportPreviewRequest;
  applyRequest: CurlImportApplyRequest;
};

export type ResolveCurlImportInputResult =
  | { ok: true; value: ResolvedCurlImportInput }
  | { ok: false; error: string };

export type CurlImportApiResult<TData> = {
  data?: TData;
  error?: unknown;
  response?: Response;
};

export type CurlImportDiagnosticsGate = {
  diagnostics: CurlImportDiagnostics;
  stats: CurlImportStats;
  message: string;
};

type CurlImportApplySuccess = Extract<CurlImportApplyResult, { result: unknown }>;
type CurlImportApplyPartial = Extract<CurlImportApplyResult, { partialResult: unknown }>;

export type NormalizedCurlImportPreviewOutcome =
  | { kind: 'success'; data: CurlImportPreviewResult }
  | { kind: 'diagnostics'; data: CurlImportDiagnosticsGate }
  | { kind: 'error'; status: number; message: string };

export type NormalizedCurlImportApplyOutcome =
  | { kind: 'success'; data: CurlImportApplySuccess }
  | { kind: 'partial'; data: CurlImportApplyPartial }
  | { kind: 'diagnostics'; data: CurlImportDiagnosticsGate }
  | { kind: 'error'; status: number; message: string };

type JsonRecord = Record<string, unknown>;

const PREVIEW_DIAGNOSTIC_GATE_MESSAGE =
  'Import preview returned error diagnostics. Resolve the command or continue apply with force.';
const APPLY_DIAGNOSTIC_GATE_MESSAGE =
  'Import apply was blocked by error diagnostics. Enable force to continue.';

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (!isJsonRecord(error)) {
    return fallback;
  }

  const nestedError = error['error'];
  if (isJsonRecord(nestedError)) {
    const nestedMessage = nestedError['message'];
    if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
      return nestedMessage;
    }
  }

  const directMessage = error['message'];
  if (typeof directMessage === 'string' && directMessage.trim().length > 0) {
    return directMessage;
  }

  return fallback;
}

function toDiagnosticsGate(
  error: unknown,
  fallbackMessage: string
): CurlImportDiagnosticsGate | undefined {
  if (!isJsonRecord(error)) {
    return undefined;
  }

  const diagnostics = error['diagnostics'];
  const stats = error['stats'];
  if (!Array.isArray(diagnostics) || !isJsonRecord(stats)) {
    return undefined;
  }

  const requestCount = stats['requestCount'];
  const fileCount = stats['fileCount'];
  const diagnosticCount = stats['diagnosticCount'];

  if (
    typeof requestCount !== 'number' ||
    typeof fileCount !== 'number' ||
    typeof diagnosticCount !== 'number'
  ) {
    return undefined;
  }

  return {
    diagnostics: diagnostics as CurlImportDiagnostics,
    stats: {
      requestCount,
      fileCount,
      diagnosticCount
    },
    message: toErrorMessage(error, fallbackMessage)
  };
}

function toConvertOptions(input: CurlImportFormInput): CurlImportConvertOptions | undefined {
  const fileName = input.fileName.trim();
  const requestName = input.requestName.trim();
  if (!fileName && !requestName) {
    return undefined;
  }

  return {
    ...(fileName ? { fileName } : {}),
    ...(requestName ? { requestName } : {})
  };
}

type CurlImportPreviewKeyInput = {
  command: string;
  outputDir: string;
  onConflict: CurlImportConflictPolicy;
  convertOptions?: CurlImportConvertOptions;
};

export function buildCurlImportPreviewKey(input: CurlImportPreviewKeyInput): string {
  return JSON.stringify({
    command: input.command.trim(),
    outputDir: input.outputDir,
    onConflict: input.onConflict,
    fileName: input.convertOptions?.fileName ?? '',
    requestName: input.convertOptions?.requestName ?? ''
  });
}

export function resolveCurlImportInput(input: CurlImportFormInput): ResolveCurlImportInputResult {
  const command = input.command.trim();
  if (!command) {
    return {
      ok: false,
      error: 'Paste a curl command to continue.'
    };
  }

  const directoryResult = toCreateDirectory(input.outputDir);
  if (!directoryResult.ok) {
    return {
      ok: false,
      error: directoryResult.error
    };
  }

  const outputDir = directoryResult.directory ?? '';
  const convertOptions = toConvertOptions(input);
  const previewRequest: CurlImportPreviewRequest = {
    command,
    planOptions: {
      outputDir,
      onConflict: input.onConflict
    },
    ...(convertOptions ? { convertOptions } : {})
  };
  const applyRequest: CurlImportApplyRequest = {
    command,
    applyOptions: {
      outputDir,
      onConflict: input.onConflict,
      mergeVariables: input.mergeVariables,
      force: input.force
    },
    ...(convertOptions ? { convertOptions } : {})
  };

  return {
    ok: true,
    value: {
      previewKey: buildCurlImportPreviewKey({
        command,
        outputDir,
        onConflict: input.onConflict,
        ...(convertOptions ? { convertOptions } : {})
      }),
      previewRequest,
      applyRequest
    }
  };
}

function isApplySuccess(value: CurlImportApplyResult): value is CurlImportApplySuccess {
  return isJsonRecord(value) && 'result' in value;
}

function isApplyPartial(value: CurlImportApplyResult): value is CurlImportApplyPartial {
  return isJsonRecord(value) && 'partialResult' in value;
}

export function normalizeCurlImportPreviewOutcome(
  result: CurlImportApiResult<CurlImportPreviewResult>
): NormalizedCurlImportPreviewOutcome {
  if (result.data) {
    return {
      kind: 'success',
      data: result.data
    };
  }

  const diagnosticsGate = toDiagnosticsGate(result.error, PREVIEW_DIAGNOSTIC_GATE_MESSAGE);
  if (diagnosticsGate) {
    return {
      kind: 'diagnostics',
      data: diagnosticsGate
    };
  }

  const status = result.response?.status ?? 0;
  return {
    kind: 'error',
    status,
    message: toErrorMessage(
      result.error,
      status > 0 ? `Import preview failed (HTTP ${status}).` : 'Import preview failed.'
    )
  };
}

export function normalizeCurlImportApplyOutcome(
  result: CurlImportApiResult<CurlImportApplyResult>
): NormalizedCurlImportApplyOutcome {
  if (result.data) {
    if (isApplySuccess(result.data)) {
      return {
        kind: 'success',
        data: result.data
      };
    }

    if (isApplyPartial(result.data)) {
      return {
        kind: 'partial',
        data: result.data
      };
    }
  }

  const diagnosticsGate = toDiagnosticsGate(result.error, APPLY_DIAGNOSTIC_GATE_MESSAGE);
  if (diagnosticsGate) {
    return {
      kind: 'diagnostics',
      data: diagnosticsGate
    };
  }

  const status = result.response?.status ?? 0;
  return {
    kind: 'error',
    status,
    message: toErrorMessage(
      result.error,
      status > 0 ? `Import apply failed (HTTP ${status}).` : 'Import apply failed.'
    )
  };
}
