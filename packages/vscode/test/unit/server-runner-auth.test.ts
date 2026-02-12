import { describe, expect, test } from 'bun:test';
import type { TreqClient } from '@t-req/sdk/client';
import type * as vscode from 'vscode';
import {
  createServerRunner,
  isServerAuthError,
  ServerAuthError
} from '../../src/execution/server-runner';

function makeContext(): Parameters<ReturnType<typeof createServerRunner>['run']>[0] {
  return {
    documentUri: { fsPath: '/workspace/test.http' } as unknown as vscode.Uri,
    workspaceFolderPath: '/workspace',
    documentText: 'GET http://localhost:1234/ok',
    request: {
      index: 0,
      method: 'GET',
      url: 'http://localhost:1234/ok',
      startLine: 0,
      methodLine: 0,
      endLine: 0,
      raw: 'GET http://localhost:1234/ok'
    },
    fileVariables: {},
    profile: undefined,
    timeoutMs: 5000,
    maxBodyBytes: 1024,
    signal: new AbortController().signal,
    output: {
      appendLine: () => undefined
    } as unknown as vscode.OutputChannel
  };
}

describe('server runner auth errors', () => {
  test('throws ServerAuthError on 401 and still attempts to finish flow', async () => {
    let finishCalled = false;
    const runner = createServerRunner('http://localhost:4097', 'token', {
      createClient: () =>
        ({
          postFlows: () =>
            Promise.resolve({
              data: { flowId: 'flow_1' },
              response: new Response(null, { status: 201 })
            }),
          postExecute: () =>
            Promise.resolve({
              error: { error: { message: 'Unauthorized' } },
              response: new Response(null, { status: 401 })
            }),
          postFlowsByFlowIdFinish: () => {
            finishCalled = true;
            return Promise.resolve({
              data: {
                flowId: 'flow_1',
                summary: {
                  total: 1,
                  succeeded: 0,
                  failed: 1,
                  durationMs: 10
                }
              },
              response: new Response(null, { status: 200 })
            });
          }
        }) as unknown as TreqClient
    });

    let caught: unknown;
    try {
      await runner.run(makeContext());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServerAuthError);
    expect(isServerAuthError(caught)).toBe(true);
    expect((caught as ServerAuthError).status).toBe(401);
    expect(finishCalled).toBe(true);
  });

  test('type guard rejects unrelated errors', () => {
    expect(isServerAuthError(new Error('HTTP 401'))).toBe(false);
    expect(isServerAuthError({})).toBe(false);
  });
});
