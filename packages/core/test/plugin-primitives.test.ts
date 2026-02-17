import { describe, expect, test } from 'bun:test';
import { parse } from '../src/parser';
import type { TreqPlugin, ValidateOutput } from '../src/plugin';
import { definePlugin, PluginManager } from '../src/plugin';

// ============================================================================
// Primitive 1: Directives Array
// ============================================================================

describe('Primitive 1: directives array', () => {
  test('parses single directive into directives[]', () => {
    const requests = parse(`
# @timeout 5000
GET https://example.com
`);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.directives).toBeDefined();
    expect(requests[0]?.directives).toHaveLength(1);
    expect(requests[0]?.directives?.[0]).toEqual({
      name: 'timeout',
      value: '5000',
      line: 1
    });
  });

  test('preserves ALL repeated directives (lossless)', () => {
    const requests = parse(`
# @tag auth
# @tag critical
# @assert status == 200
# @assert body.id exists
GET https://example.com
`);

    expect(requests).toHaveLength(1);
    const directives = requests[0]?.directives;
    expect(directives).toHaveLength(4);

    // All directives preserved in order
    expect(directives?.[0]).toEqual({ name: 'tag', value: 'auth', line: 1 });
    expect(directives?.[1]).toEqual({ name: 'tag', value: 'critical', line: 2 });
    expect(directives?.[2]).toEqual({ name: 'assert', value: 'status == 200', line: 3 });
    expect(directives?.[3]).toEqual({ name: 'assert', value: 'body.id exists', line: 4 });

    // meta still has last-writer-wins behavior (backward compat)
    expect(requests[0]?.meta['tag']).toBe('critical');
    expect(requests[0]?.meta['assert']).toBe('body.id exists');
  });

  test('includes @name in directives', () => {
    const requests = parse(`
# @name getUser
GET https://example.com
`);

    expect(requests[0]?.name).toBe('getUser');
    expect(requests[0]?.directives).toHaveLength(1);
    expect(requests[0]?.directives?.[0]).toEqual({ name: 'name', value: 'getUser', line: 1 });
  });

  test('omits directives when none present', () => {
    const requests = parse(`
GET https://example.com
`);

    expect(requests[0]?.directives).toBeUndefined();
  });

  test('handles empty directive value', () => {
    const requests = parse(`
# @sse
GET https://example.com
`);

    expect(requests[0]?.directives?.[0]).toEqual({ name: 'sse', value: '', line: 1 });
  });

  test('preserves directive order across separator blocks', () => {
    const requests = parse(`
# @tag first
GET https://example.com/a
###
# @tag second
GET https://example.com/b
`);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.directives?.[0]?.value).toBe('first');
    expect(requests[1]?.directives?.[0]?.value).toBe('second');
  });
});

// ============================================================================
// Primitive 3: ctx.report() and PluginReport
// ============================================================================

describe('Primitive 3: ctx.report()', () => {
  async function makeManager(plugins: TreqPlugin[]): Promise<PluginManager> {
    const manager = new PluginManager({
      projectRoot: '.',
      plugins
    });
    await manager.initialize();
    return manager;
  }

  const mockResponse = new Response('', { status: 200, statusText: 'OK' });
  const mockTiming = { total: 100, dns: 0, connect: 0, tls: 0, ttfb: 50, download: 50 };

  test('report accumulates in session.reports', async () => {
    const plugin = definePlugin({
      name: 'test-reporter',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          input.ctx.report({ summary: 'all good', passed: true });
        }
      }
    });

    const manager = await makeManager([plugin]);
    const hookCtx = manager.createHookContext({});
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: hookCtx
      },
      {}
    );

    const reports = manager.getReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.pluginName).toBe('test-reporter');
    expect(typeof reports[0]?.runId).toBe('string');
    expect(typeof reports[0]?.ts).toBe('number');
    expect(typeof reports[0]?.seq).toBe('number');
    expect(reports[0]?.data).toEqual({ summary: 'all good', passed: true });
  });

  test('report stamps requestName from CompiledRequest.name', async () => {
    const plugin = definePlugin({
      name: 'test-reporter',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          input.ctx.report({ note: 'has name' });
        }
      }
    });

    const manager = await makeManager([plugin]);
    const hookCtx = manager.createHookContext({});
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {}, name: 'getUser' },
        response: mockResponse,
        timing: mockTiming,
        ctx: hookCtx
      },
      {}
    );

    const reports = manager.getReports();
    expect(reports[0]?.requestName).toBe('getUser');
  });

  test('report rejects non-serializable data', async () => {
    const plugin = definePlugin({
      name: 'bad-reporter',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          const circular: Record<string, unknown> = {};
          circular['self'] = circular;
          input.ctx.report(circular);
        }
      }
    });

    const manager = await makeManager([plugin]);
    const hookCtx = manager.createHookContext({});
    // The hook should fail gracefully (caught by executeHook)
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: hookCtx
      },
      {}
    );

    // Report should not be added (error was caught)
    expect(manager.getReports()).toHaveLength(0);
  });

  test('multiple plugins produce independent reports', async () => {
    const pluginA = definePlugin({
      name: 'plugin-a',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          input.ctx.report({ from: 'a' });
        }
      }
    });

    const pluginB = definePlugin({
      name: 'plugin-b',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          input.ctx.report({ from: 'b' });
        }
      }
    });

    const manager = await makeManager([pluginA, pluginB]);
    const hookCtx = manager.createHookContext({});
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: hookCtx
      },
      {}
    );

    const reports = manager.getReports();
    expect(reports).toHaveLength(2);
    expect(reports[0]?.pluginName).toBe('plugin-a');
    expect(reports[1]?.pluginName).toBe('plugin-b');
  });

  test('report accepts any JSON-serializable data shape', async () => {
    const plugin = definePlugin({
      name: 'flexible-reporter',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          // Metrics-style report — no summary, passed, or details
          input.ctx.report({ p50: 45, p99: 230 });
        }
      }
    });

    const manager = await makeManager([plugin]);
    const hookCtx = manager.createHookContext({});
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: hookCtx
      },
      {}
    );

    const reports = manager.getReports();
    expect(reports[0]?.data).toEqual({ p50: 45, p99: 230 });
  });

  test('clearReportsForRun also clears run sequence state', async () => {
    const plugin = definePlugin({
      name: 'seq-reporter',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          input.ctx.report({ ok: true });
        }
      }
    });

    const manager = await makeManager([plugin]);
    const runId = 'run-reused';

    const firstCtx = manager.createHookContext({ executionContext: { runId } });
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: firstCtx
      },
      {}
    );
    expect(manager.getReportsForRun(runId)[0]?.seq).toBe(1);

    manager.clearReportsForRun(runId);
    expect(manager.getReportsForRun(runId)).toHaveLength(0);

    const secondCtx = manager.createHookContext({ executionContext: { runId } });
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: secondCtx
      },
      {}
    );
    expect(manager.getReportsForRun(runId)[0]?.seq).toBe(1);
  });

  test('clearReportsForFlow also clears flow sequence state', async () => {
    const plugin = definePlugin({
      name: 'flow-seq-reporter',
      version: '1.0.0',
      hooks: {
        'response.after'(input) {
          input.ctx.report({ ok: true });
        }
      }
    });

    const manager = await makeManager([plugin]);
    const flowId = 'flow-reused';

    const firstCtx = manager.createHookContext({ executionContext: { runId: 'run-1', flowId } });
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: firstCtx
      },
      {}
    );
    expect(manager.getReports()[0]?.seq).toBe(1);

    manager.clearReportsForFlow(flowId);
    expect(manager.getReports()).toHaveLength(0);

    const secondCtx = manager.createHookContext({ executionContext: { runId: 'run-2', flowId } });
    await manager.triggerResponseAfter(
      {
        request: { method: 'GET', url: 'https://example.com', headers: {} },
        response: mockResponse,
        timing: mockTiming,
        ctx: secondCtx
      },
      {}
    );
    expect(manager.getReports()[0]?.seq).toBe(1);
  });
});

// ============================================================================
// Primitive 4: validate hook
// ============================================================================

describe('Primitive 4: validate hook', () => {
  async function makeManager(plugins: TreqPlugin[]): Promise<PluginManager> {
    const manager = new PluginManager({
      projectRoot: '.',
      plugins
    });
    await manager.initialize();
    return manager;
  }

  test('validate hook is accepted by definePlugin', () => {
    const plugin = definePlugin({
      name: 'validator',
      version: '1.0.0',
      hooks: {
        validate(_input, output) {
          output.diagnostics.push({
            severity: 'warning',
            code: 'test-check',
            message: 'Test diagnostic',
            range: {
              start: { line: 0, column: 0 },
              end: { line: 0, column: 5 }
            }
          });
        }
      }
    });

    expect(plugin.hooks?.validate).toBeDefined();
  });

  test('triggerValidate collects plugin diagnostics', async () => {
    const plugin = definePlugin({
      name: 'assert-validator',
      version: '1.0.0',
      hooks: {
        validate(input, output) {
          const lines = input.content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]?.trim() ?? '';
            const match = line.match(/^(?:#|\/\/)\s*@assert\s+(.+)$/);
            if (!match) continue;
            const expr = match[1] ?? '';

            // Detect single = instead of ==
            if (/\w\s*=\s*\w/.test(expr) && !/==/.test(expr)) {
              output.diagnostics.push({
                severity: 'warning',
                code: 'assert-single-equals',
                message: "Use '==' for comparison, not '='",
                range: {
                  start: { line: i, column: 0 },
                  end: { line: i, column: line.length }
                }
              });
            }
          }
        }
      }
    });

    const manager = await makeManager([plugin]);

    const content = '# @assert status = 200\nGET https://example.com\n';
    const hookCtx = manager.createHookContext({});
    const output: ValidateOutput = { diagnostics: [] };

    await manager.triggerValidate(
      { content, path: 'test.http', linePositions: [0, 23, 46], ctx: hookCtx },
      output
    );

    expect(output.diagnostics).toHaveLength(1);
    expect(output.diagnostics[0]?.code).toBe('assert-single-equals');
    expect(output.diagnostics[0]?.severity).toBe('warning');
  });

  test('validate hook with no issues produces empty diagnostics', async () => {
    const plugin = definePlugin({
      name: 'no-issues',
      version: '1.0.0',
      hooks: {
        validate() {
          // Does nothing — no issues found
        }
      }
    });

    const manager = await makeManager([plugin]);

    const hookCtx = manager.createHookContext({});
    const output: ValidateOutput = { diagnostics: [] };

    await manager.triggerValidate(
      {
        content: 'GET https://example.com\n',
        path: 'test.http',
        linePositions: [0, 23],
        ctx: hookCtx
      },
      output
    );

    expect(output.diagnostics).toHaveLength(0);
  });
});
