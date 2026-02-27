import { describe, expect, it } from 'bun:test';
import type { CurlImportApplyResult, CurlImportPreviewResult } from '@t-req/sdk/client';
import {
  buildCurlImportPreviewKey,
  normalizeCurlImportApplyOutcome,
  normalizeCurlImportPreviewOutcome,
  resolveCurlImportInput
} from './curl-import';

function makeResponse(status: number): Response {
  return new Response(null, { status });
}

function makeSummary() {
  return {
    written: ['imports/curl-request.http'],
    skipped: [],
    renamed: [],
    failed: [],
    variablesMerged: false
  };
}

function makeStats() {
  return {
    requestCount: 1,
    fileCount: 1,
    diagnosticCount: 0
  };
}

describe('resolveCurlImportInput', () => {
  it('builds preview and apply requests for valid input', () => {
    const resolved = resolveCurlImportInput({
      command: ' curl https://api.example.com/users ',
      outputDir: 'imports/rest',
      onConflict: 'rename',
      fileName: ' users ',
      requestName: ' list users ',
      mergeVariables: true,
      force: true
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }

    expect(resolved.value.previewRequest).toEqual({
      command: 'curl https://api.example.com/users',
      convertOptions: {
        fileName: 'users',
        requestName: 'list users'
      },
      planOptions: {
        outputDir: 'imports/rest',
        onConflict: 'rename'
      }
    });
    expect(resolved.value.applyRequest).toEqual({
      command: 'curl https://api.example.com/users',
      convertOptions: {
        fileName: 'users',
        requestName: 'list users'
      },
      applyOptions: {
        outputDir: 'imports/rest',
        onConflict: 'rename',
        mergeVariables: true,
        force: true
      }
    });
  });

  it('omits convert options when file and request names are blank', () => {
    const resolved = resolveCurlImportInput({
      command: 'curl https://api.example.com/users',
      outputDir: 'imports',
      onConflict: 'fail',
      fileName: '   ',
      requestName: '',
      mergeVariables: false,
      force: false
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }

    expect(resolved.value.previewRequest.convertOptions).toBeUndefined();
    expect(resolved.value.applyRequest.convertOptions).toBeUndefined();
  });

  it('rejects empty curl command input', () => {
    const resolved = resolveCurlImportInput({
      command: '   ',
      outputDir: 'imports',
      onConflict: 'fail',
      fileName: '',
      requestName: '',
      mergeVariables: false,
      force: false
    });

    expect(resolved).toEqual({
      ok: false,
      error: 'Paste a curl command to continue.'
    });
  });

  it('rejects directory traversal in output directory', () => {
    const resolved = resolveCurlImportInput({
      command: 'curl https://api.example.com/users',
      outputDir: 'imports/../secrets',
      onConflict: 'fail',
      fileName: '',
      requestName: '',
      mergeVariables: false,
      force: false
    });

    expect(resolved).toEqual({
      ok: false,
      error: 'Directory cannot include "..".'
    });
  });
});

describe('buildCurlImportPreviewKey', () => {
  it('changes key when convert options change', () => {
    const baseKey = buildCurlImportPreviewKey({
      command: 'curl https://api.example.com/users',
      outputDir: 'imports',
      onConflict: 'fail',
      mergeVariables: false,
      convertOptions: {
        fileName: 'curl-request'
      }
    });

    const nextKey = buildCurlImportPreviewKey({
      command: 'curl https://api.example.com/users',
      outputDir: 'imports',
      onConflict: 'fail',
      mergeVariables: false,
      convertOptions: {
        fileName: 'curl-request-2'
      }
    });

    expect(baseKey).not.toBe(nextKey);
  });

  it('changes key when mergeVariables changes', () => {
    const baseKey = buildCurlImportPreviewKey({
      command: 'curl https://api.example.com/users',
      outputDir: 'imports',
      onConflict: 'fail',
      mergeVariables: false
    });

    const nextKey = buildCurlImportPreviewKey({
      command: 'curl https://api.example.com/users',
      outputDir: 'imports',
      onConflict: 'fail',
      mergeVariables: true
    });

    expect(baseKey).not.toBe(nextKey);
  });
});

describe('normalizeCurlImportPreviewOutcome', () => {
  it('returns success for 200 data payload', () => {
    const data: CurlImportPreviewResult = {
      result: makeSummary(),
      diagnostics: [],
      stats: makeStats()
    };

    const outcome = normalizeCurlImportPreviewOutcome({
      data,
      response: makeResponse(200)
    });

    expect(outcome).toEqual({
      kind: 'success',
      data
    });
  });

  it('returns diagnostics outcome for 422-style payloads', () => {
    const outcome = normalizeCurlImportPreviewOutcome({
      error: {
        diagnostics: [{ code: 'invalid-input', severity: 'error', message: 'Invalid command' }],
        stats: { requestCount: 0, fileCount: 0, diagnosticCount: 1 }
      },
      response: makeResponse(422)
    });

    expect(outcome.kind).toBe('diagnostics');
    if (outcome.kind !== 'diagnostics') {
      return;
    }

    expect(outcome.data.stats.diagnosticCount).toBe(1);
    expect(outcome.data.diagnostics[0]?.code).toBe('invalid-input');
  });

  it('returns error outcome for generic failures', () => {
    const outcome = normalizeCurlImportPreviewOutcome({
      error: { error: { message: 'Unknown import source' } },
      response: makeResponse(400)
    });

    expect(outcome).toEqual({
      kind: 'error',
      status: 400,
      message: 'Unknown import source'
    });
  });
});

describe('normalizeCurlImportApplyOutcome', () => {
  it('returns success for 200 apply payload', () => {
    const data: Extract<CurlImportApplyResult, { result: unknown }> = {
      result: makeSummary(),
      diagnostics: [],
      stats: makeStats()
    };

    const outcome = normalizeCurlImportApplyOutcome({
      data,
      response: makeResponse(200)
    });

    expect(outcome).toEqual({
      kind: 'success',
      data
    });
  });

  it('returns partial for 207 apply payload', () => {
    const data: Extract<CurlImportApplyResult, { partialResult: unknown }> = {
      partialResult: {
        ...makeSummary(),
        failed: [{ path: 'imports/a.http', error: 'EISDIR' }]
      }
    };

    const outcome = normalizeCurlImportApplyOutcome({
      data,
      response: makeResponse(207)
    });

    expect(outcome).toEqual({
      kind: 'partial',
      data
    });
  });

  it('returns diagnostics for 422 apply errors', () => {
    const outcome = normalizeCurlImportApplyOutcome({
      error: {
        diagnostics: [{ code: 'missing-url', severity: 'error', message: 'Could not parse URL' }],
        stats: { requestCount: 0, fileCount: 0, diagnosticCount: 1 }
      },
      response: makeResponse(422)
    });

    expect(outcome.kind).toBe('diagnostics');
    if (outcome.kind !== 'diagnostics') {
      return;
    }

    expect(outcome.data.stats.requestCount).toBe(0);
    expect(outcome.data.diagnostics[0]?.code).toBe('missing-url');
  });
});
