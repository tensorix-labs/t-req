import { describe, expect, test } from 'bun:test';
import type { TreqClient } from '@t-req/sdk/client';
import type * as vscode from 'vscode';

const { createServerRunner } = await import('../../src/execution/server-runner');

describe('server runner', () => {
  test('enriches plugin hooks and reports on successful detail fetch', async () => {
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
              data: {
                runId: 'run_1',
                flowId: 'flow_1',
                reqExecId: 'req_1',
                request: {
                  index: 0,
                  method: 'GET',
                  url: 'http://localhost:1234/ok'
                },
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: [{ name: 'content-type', value: 'application/json' }],
                  body: '{"ok":true}',
                  encoding: 'utf-8',
                  truncated: false,
                  bodyBytes: 11,
                  bodyMode: 'buffered'
                },
                timing: {
                  startTime: 100,
                  endTime: 130,
                  durationMs: 30
                },
                resolved: {
                  workspaceRoot: '/workspace',
                  projectRoot: '/workspace',
                  basePath: '.'
                }
              },
              response: new Response(null, { status: 200 })
            }),
          getFlowsByFlowIdExecutionsByReqExecId: () =>
            Promise.resolve({
              data: {
                pluginHooks: [
                  {
                    pluginName: '@t-req/plugin-assert',
                    hook: 'response.after',
                    durationMs: 4.1,
                    modified: false
                  }
                ],
                pluginReports: [
                  {
                    pluginName: '@t-req/plugin-assert',
                    runId: 'run_1',
                    flowId: 'flow_1',
                    reqExecId: 'req_1',
                    requestName: 'Request 1',
                    ts: 200,
                    seq: 1,
                    data: { kind: 'assert', passed: true, total: 1, failed: 0, checks: [] }
                  }
                ],
                timing: { ttfb: 12.3 }
              },
              response: new Response(null, { status: 200 })
            }),
          postFlowsByFlowIdFinish: () =>
            Promise.resolve({
              data: {
                flowId: 'flow_1',
                summary: {
                  total: 1,
                  succeeded: 1,
                  failed: 0,
                  durationMs: 30
                }
              },
              response: new Response(null, { status: 200 })
            })
        }) as unknown as TreqClient
    });

    const result = await runner.run({
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
    });

    expect(result.mode).toBe('server');
    expect(result.pluginHooks).toHaveLength(1);
    expect(result.pluginHooks[0]?.hook).toBe('response.after');
    expect(result.pluginReports).toHaveLength(1);
    expect(result.pluginReports[0]?.pluginName).toBe('@t-req/plugin-assert');
    expect(result.timing.ttfb).toBe(12.3);
    expect(result.warnings).toHaveLength(0);
  });

  test('keeps execute result when enrichment fails', async () => {
    const runner = createServerRunner('http://localhost:4097', '', {
      createClient: () =>
        ({
          postFlows: () =>
            Promise.resolve({
              data: { flowId: 'flow_1' },
              response: new Response(null, { status: 201 })
            }),
          postExecute: () =>
            Promise.resolve({
              data: {
                runId: 'run_1',
                flowId: 'flow_1',
                reqExecId: 'req_1',
                request: {
                  index: 0,
                  method: 'GET',
                  url: 'http://localhost:1234/ok'
                },
                response: {
                  status: 200,
                  statusText: 'OK',
                  headers: [{ name: 'content-type', value: 'application/json' }],
                  body: '{"ok":true}',
                  encoding: 'utf-8',
                  truncated: false,
                  bodyBytes: 11,
                  bodyMode: 'buffered'
                },
                timing: {
                  startTime: 100,
                  endTime: 130,
                  durationMs: 30
                },
                resolved: {
                  workspaceRoot: '/workspace',
                  projectRoot: '/workspace',
                  basePath: '.'
                }
              },
              response: new Response(null, { status: 200 })
            }),
          getFlowsByFlowIdExecutionsByReqExecId: () =>
            Promise.resolve({
              error: { error: { message: 'detail unavailable' } },
              response: new Response(null, { status: 500 })
            }),
          postFlowsByFlowIdFinish: () =>
            Promise.resolve({
              data: {
                flowId: 'flow_1',
                summary: {
                  total: 1,
                  succeeded: 1,
                  failed: 0,
                  durationMs: 30
                }
              },
              response: new Response(null, { status: 200 })
            })
        }) as unknown as TreqClient
    });

    const outputLines: string[] = [];
    const result = await runner.run({
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
        appendLine: (line: string) => outputLines.push(line)
      } as unknown as vscode.OutputChannel
    });

    expect(result.mode).toBe('server');
    expect(result.response.status).toBe(200);
    expect(result.response.body).toBe('{"ok":true}');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Failed to enrich execution details');
    expect(outputLines.some((line) => line.includes('enrichment warning'))).toBe(true);
  });
});
