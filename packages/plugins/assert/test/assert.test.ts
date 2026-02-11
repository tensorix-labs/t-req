import { describe, expect, test } from 'bun:test';
import { createPluginManager, type ValidateOutput } from '@t-req/core/plugin';
import assertPlugin, { parseAssertionExpression } from '../src/index';
import { createMemoizedParser } from '../src/parser/cache';

function linePositions(content: string): number[] {
  const positions: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      positions.push(i + 1);
    }
  }
  return positions;
}

describe('parseAssertionExpression', () => {
  test('parses status assertion', () => {
    const parsed = parseAssertionExpression('status == 200');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.assertion.target).toBe('status');
      expect(parsed.assertion.operator).toBe('==');
    }
  });

  test('parses header contains assertion', () => {
    const parsed = parseAssertionExpression('header Content-Type contains application/json');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.assertion.target).toBe('header');
      if (parsed.assertion.target === 'header') {
        expect(parsed.assertion.headerName).toBe('Content-Type');
        expect(parsed.assertion.operator).toBe('contains');
      }
    }
  });

  test('parses body assertion with quoted value', () => {
    const parsed = parseAssertionExpression('body contains "hello world"');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.assertion.target).toBe('body');
      if (parsed.assertion.target === 'body') {
        expect(parsed.assertion.expected).toBe('hello world');
      }
    }
  });

  test('parses jsonpath exists assertion', () => {
    const parsed = parseAssertionExpression('jsonpath $.token exists');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.assertion.target).toBe('jsonpath');
      if (parsed.assertion.target === 'jsonpath') {
        expect(parsed.assertion.path).toBe('$.token');
        expect(parsed.assertion.operator).toBe('exists');
      }
    }
  });

  test('rejects shorthand status assertion', () => {
    const parsed = parseAssertionExpression('status 200');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('assert.operator');
    }
  });

  test('rejects unknown target', () => {
    const parsed = parseAssertionExpression('foo == bar');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('assert.target');
    }
  });

  test('rejects missing comparison value', () => {
    const parsed = parseAssertionExpression('body contains');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('assert.missing-value');
    }
  });

  test('rejects invalid jsonpath expression', () => {
    const parsed = parseAssertionExpression('jsonpath token exists');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('assert.invalid-jsonpath');
    }
  });

  test('rejects invalid header operator token', () => {
    const parsed = parseAssertionExpression('header Content-Type starts-with application/json');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('assert.operator');
    }
  });
});

describe('parser memoization cache', () => {
  test('reuses cached parse result for repeated expression', () => {
    let calls = 0;
    const memoized = createMemoizedParser((expression) => {
      calls++;
      return parseAssertionExpression(expression);
    }, 8);

    memoized('status == 200');
    memoized('status == 200');

    expect(calls).toBe(1);
  });

  test('evicts oldest entry when cache is full', () => {
    let calls = 0;
    const memoized = createMemoizedParser((expression) => {
      calls++;
      return parseAssertionExpression(expression);
    }, 2);

    memoized('status == 200');
    memoized('status == 201');
    memoized('status == 202');
    memoized('status == 200');

    expect(calls).toBe(4);
  });
});

describe('runtime assertion evaluation', () => {
  async function runWithAssertions(assertions: string[], response: Response) {
    const manager = createPluginManager({
      projectRoot: process.cwd(),
      plugins: [assertPlugin()]
    });
    await manager.initialize();

    const ctx = manager.createHookContext({});
    const directives = assertions.map((value, index) => ({
      name: 'assert',
      value,
      line: index
    }));

    await manager.triggerResponseAfter(
      {
        request: {
          method: 'GET',
          url: 'https://example.com',
          headers: {},
          directives
        },
        response,
        timing: { total: 1 },
        ctx
      },
      {}
    );

    const reports = manager.getReports();
    await manager.teardown();
    return reports;
  }

  test('emits one summary report for passing assertions', async () => {
    const response = new Response(JSON.stringify({ token: 'abc123', count: 2 }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': 'trace-1'
      }
    });

    const reports = await runWithAssertions(
      [
        'status == 200',
        'header Content-Type contains application/json',
        'body contains "abc123"',
        'jsonpath $.token exists',
        'jsonpath $.count == 2'
      ],
      response
    );

    expect(reports).toHaveLength(1);
    const data = reports[0]?.data as {
      kind: string;
      passed: boolean;
      total: number;
      failed: number;
      checks: Array<{ passed: boolean }>;
    };
    expect(data.kind).toBe('assert');
    expect(data.passed).toBe(true);
    expect(data.total).toBe(5);
    expect(data.failed).toBe(0);
    expect(data.checks.every((check) => check.passed)).toBe(true);
  });

  test('fails when assertion check fails', async () => {
    const response = new Response(JSON.stringify({ token: 'abc123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    const reports = await runWithAssertions(['status == 201'], response);
    expect(reports).toHaveLength(1);

    const data = reports[0]?.data as {
      passed: boolean;
      failed: number;
      checks: Array<{ passed: boolean; code?: string }>;
    };
    expect(data.passed).toBe(false);
    expect(data.failed).toBe(1);
    expect(data.checks[0]?.passed).toBe(false);
    expect(data.checks[0]?.code).toBe('assert.failed');
  });

  test('fails fast for malformed expressions but still reports summary', async () => {
    const response = new Response('ok', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

    const reports = await runWithAssertions(['status 200'], response);
    expect(reports).toHaveLength(1);

    const data = reports[0]?.data as {
      passed: boolean;
      failed: number;
      checks: Array<{ passed: boolean; code?: string }>;
    };
    expect(data.passed).toBe(false);
    expect(data.failed).toBe(1);
    expect(data.checks[0]?.code).toBe('assert.operator');
  });

  test('fails jsonpath checks for non-json response body', async () => {
    const response = new Response('not-json', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

    const reports = await runWithAssertions(['jsonpath $.token exists'], response);
    const data = reports[0]?.data as {
      passed: boolean;
      checks: Array<{ passed: boolean; message: string }>;
    };

    expect(data.passed).toBe(false);
    expect(data.checks[0]?.passed).toBe(false);
    expect(data.checks[0]?.message).toContain('JSON parsing failed');
  });

  test('treats object key order as equal for jsonpath comparisons', async () => {
    const response = new Response(JSON.stringify({ obj: { b: 2, a: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    const reports = await runWithAssertions(['jsonpath $.obj == {"a":1,"b":2}'], response);
    const data = reports[0]?.data as { passed: boolean; failed: number };

    expect(data.passed).toBe(true);
    expect(data.failed).toBe(0);
  });

  test('applies key-order-insensitive equality to jsonpath != checks', async () => {
    const response = new Response(JSON.stringify({ obj: { b: 2, a: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    const reports = await runWithAssertions(['jsonpath $.obj != {"a":1,"b":2}'], response);
    const data = reports[0]?.data as { passed: boolean; failed: number };

    expect(data.passed).toBe(false);
    expect(data.failed).toBe(1);
  });

  test('does not emit reports when there are no @assert directives', async () => {
    const reports = await runWithAssertions([], new Response('ok', { status: 200 }));
    expect(reports).toHaveLength(0);
  });

  test('does not consume original response body stream', async () => {
    const response = new Response(JSON.stringify({ token: 'abc123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

    await runWithAssertions(['body contains "abc123"', 'jsonpath $.token exists'], response);
    const text = await response.text();
    expect(text).toContain('abc123');
  });
});

describe('validate hook diagnostics', () => {
  async function runValidate(content: string) {
    const manager = createPluginManager({
      projectRoot: process.cwd(),
      plugins: [assertPlugin()]
    });
    await manager.initialize();

    const output: ValidateOutput = { diagnostics: [] };
    await manager.triggerValidate(
      {
        content,
        path: 'test.http',
        linePositions: linePositions(content),
        ctx: manager.createHookContext({})
      },
      output
    );

    await manager.teardown();
    return output.diagnostics;
  }

  test('emits error for malformed assertion syntax', async () => {
    const diagnostics = await runValidate('# @assert status 200\nGET https://example.com\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe('assert.operator');
  });

  test('emits error for misplaced @assert lines after request line', async () => {
    const diagnostics = await runValidate('GET https://example.com\n# @assert status == 200\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('assert.position');
    expect(diagnostics[0]?.range.start.line).toBe(1);
  });

  test('supports // directive comments before request line', async () => {
    const diagnostics = await runValidate('// @assert status == 200\nGET https://example.com\n');
    expect(diagnostics).toHaveLength(0);
  });

  test('detects misplaced directives independently per request block', async () => {
    const diagnostics = await runValidate(
      '# @assert status == 200\nGET https://one.example\n###\nGET https://two.example\n// @assert status == 200\n'
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('assert.position');
    expect(diagnostics[0]?.range.start.line).toBe(4);
  });

  test('emits no diagnostics for valid assertions', async () => {
    const diagnostics = await runValidate(
      '# @assert status == 200\n# @assert jsonpath $.token exists\nGET https://example.com\n'
    );
    expect(diagnostics).toHaveLength(0);
  });
});
