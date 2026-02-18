import { describe, expect, test } from 'bun:test';
import {
  importCurlApply,
  importCurlApplyStrict,
  importCurlPreview,
  importCurlPreviewStrict,
  SDKError
} from '../src/client';
import type { TreqClient } from '../src/gen/sdk.gen';
import type { ImportApplyResponse, ImportPreviewResponses } from '../src/gen/types.gen';

type FieldResponse<TData, TError = unknown> = Promise<{
  data: TData | undefined;
  error: TError | undefined;
  response: Response;
}>;

const previewResult: ImportPreviewResponses[200] = {
  result: {
    written: ['imports/curl-request.http'],
    skipped: [],
    renamed: [],
    failed: [],
    variablesMerged: false
  },
  diagnostics: [],
  stats: {
    requestCount: 1,
    fileCount: 1,
    diagnosticCount: 0
  }
};

const applyResult: ImportApplyResponse = {
  result: {
    written: ['imports/curl-request.http'],
    skipped: [],
    renamed: [],
    failed: [],
    variablesMerged: false
  },
  diagnostics: [],
  stats: {
    requestCount: 1,
    fileCount: 1,
    diagnosticCount: 0
  }
};

function createMockClient(args?: {
  previewResponse?: FieldResponse<ImportPreviewResponses[200]>;
  applyResponse?: FieldResponse<ImportApplyResponse>;
}): {
  client: TreqClient;
  previewCalls: Array<Record<string, unknown>>;
  applyCalls: Array<Record<string, unknown>>;
} {
  const previewCalls: Array<Record<string, unknown>> = [];
  const applyCalls: Array<Record<string, unknown>> = [];

  const defaultPreviewResponse: FieldResponse<ImportPreviewResponses[200]> = Promise.resolve({
    data: previewResult,
    error: undefined,
    response: new Response(null, { status: 200 })
  });
  const defaultApplyResponse: FieldResponse<ImportApplyResponse> = Promise.resolve({
    data: applyResult,
    error: undefined,
    response: new Response(null, { status: 200 })
  });

  const client = {
    importPreview: (options: Record<string, unknown>) => {
      previewCalls.push(options);
      return args?.previewResponse ?? defaultPreviewResponse;
    },
    importApply: (options: Record<string, unknown>) => {
      applyCalls.push(options);
      return args?.applyResponse ?? defaultApplyResponse;
    }
  } as unknown as TreqClient;

  return { client, previewCalls, applyCalls };
}

describe('curl import helpers', () => {
  test('importCurlPreview forwards source/body and preserves overrides', async () => {
    const { client, previewCalls } = createMockClient();

    const response = await importCurlPreview(
      client,
      {
        command: 'curl https://api.example.com/users',
        planOptions: { outputDir: 'imports', onConflict: 'rename' },
        convertOptions: { fileName: 'users', requestName: 'list users' }
      },
      { headers: { 'X-Test': '1' } }
    );

    expect(response.data).toEqual(previewResult);
    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0]).toMatchObject({
      path: { source: 'curl' },
      body: {
        input: 'curl https://api.example.com/users',
        planOptions: { outputDir: 'imports', onConflict: 'rename' },
        convertOptions: { fileName: 'users', requestName: 'list users' }
      },
      headers: { 'X-Test': '1' }
    });
  });

  test('importCurlApply forwards source/body and supports default options', async () => {
    const { client, applyCalls } = createMockClient();

    const response = await importCurlApply(client, {
      command: 'curl https://api.example.com/users',
      applyOptions: {
        outputDir: 'imports',
        onConflict: 'overwrite',
        mergeVariables: false,
        force: false
      }
    });

    expect(response.data).toEqual(applyResult);
    expect(applyCalls).toHaveLength(1);
    expect(applyCalls[0]).toMatchObject({
      path: { source: 'curl' },
      body: {
        input: 'curl https://api.example.com/users',
        applyOptions: {
          outputDir: 'imports',
          onConflict: 'overwrite',
          mergeVariables: false,
          force: false
        }
      }
    });
  });

  test('strict preview helper unwraps and returns typed data', async () => {
    const { client } = createMockClient();
    const result = await importCurlPreviewStrict(client, {
      command: 'curl https://api.example.com/users',
      planOptions: { outputDir: 'imports', onConflict: 'fail' }
    });
    expect(result).toEqual(previewResult);
  });

  test('strict apply helper supports partial success (207) payloads', async () => {
    const partialResult: ImportApplyResponse = {
      partialResult: {
        written: ['imports/a.http'],
        skipped: [],
        renamed: [],
        failed: [{ path: 'imports/b.http', error: 'EISDIR' }],
        variablesMerged: false
      }
    };

    const { client } = createMockClient({
      applyResponse: Promise.resolve({
        data: partialResult,
        error: undefined,
        response: new Response(null, { status: 207 })
      })
    });

    const result = await importCurlApplyStrict(client, {
      command: 'curl https://api.example.com/users',
      applyOptions: {
        outputDir: 'imports',
        onConflict: 'fail',
        mergeVariables: false,
        force: false
      }
    });

    expect(result).toEqual(partialResult);
  });

  test('strict apply helper throws SDKError on API errors', async () => {
    const { client } = createMockClient({
      applyResponse: Promise.resolve({
        data: undefined,
        error: { error: { message: 'Invalid convertOptions', code: 'VALIDATION_ERROR' } },
        response: new Response(null, { status: 400 })
      })
    });

    await expect(
      importCurlApplyStrict(client, {
        command: 'curl https://api.example.com/users',
        applyOptions: {
          outputDir: 'imports',
          onConflict: 'fail',
          mergeVariables: false,
          force: false
        }
      })
    ).rejects.toBeInstanceOf(SDKError);

    await importCurlApplyStrict(client, {
      command: 'curl https://api.example.com/users',
      applyOptions: {
        outputDir: 'imports',
        onConflict: 'fail',
        mergeVariables: false,
        force: false
      }
    }).catch((error: unknown) => {
      const sdkError = error as SDKError;
      expect(sdkError.status).toBe(400);
      expect(sdkError.code).toBe('VALIDATION_ERROR');
      expect(sdkError.message).toBe('Invalid convertOptions');
    });
  });
});
