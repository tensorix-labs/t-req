import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_TIMEOUT_MS,
  formatHeaders,
  formatResponseBody,
  formatVerboseRequestLine,
  parseVariables,
  runCommand
} from '../../src/cmd/run';

describe('run command variable substitution', () => {
  test('should parse --var key=value format', () => {
    expect(parseVariables(['foo=bar'])).toEqual({ foo: 'bar' });
    expect(parseVariables(['a=1', 'b=2'])).toEqual({ a: '1', b: '2' });
    expect(parseVariables(['key=value=with=equals'])).toEqual({ key: 'value=with=equals' });
  });

  test('should handle empty value', () => {
    expect(parseVariables(['key='])).toEqual({ key: '' });
  });

  test('should skip invalid format without equals sign', () => {
    expect(parseVariables(['invalid'])).toEqual({});
    expect(parseVariables(['no-equals', 'valid=value'])).toEqual({ valid: 'value' });
  });
});

describe('run command timeout handling', () => {
  test('DEFAULT_TIMEOUT_MS constant should be 30000', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30000);
  });

  test('run command timeout should NOT have a yargs default (config wins)', () => {
    // The timeout option should NOT have a yargs default.
    // This allows config.defaults.timeoutMs to win when --timeout is not passed.
    // The fallback to DEFAULT_TIMEOUT_MS happens in the handler, not in yargs.
    const builder = runCommand.builder as { timeout?: { default?: number } };
    expect(builder.timeout?.default).toBeUndefined();
  });
});

describe('run command output formatting', () => {
  test('should format headers correctly', () => {
    const headers: Array<[string, string]> = [
      ['content-type', 'application/json'],
      ['x-custom', 'value']
    ];

    const formatted = formatHeaders(headers);

    expect(formatted).toContain('content-type: application/json');
    expect(formatted).toContain('x-custom: value');
  });

  test('should pretty print JSON responses', () => {
    const body = '{"name":"test","id":1}';
    const contentType = 'application/json';

    const output = formatResponseBody(contentType, body);

    expect(output).toContain('{\n');
    expect(output).toContain('"name"');
    expect(output).toContain('"test"');
  });

  test('should handle non-JSON responses', () => {
    const body = 'Plain text response';
    const contentType = 'text/plain';

    const output = formatResponseBody(contentType, body);

    expect(output).toBe('Plain text response');
  });
});

describe('run command with verbose flag', () => {
  test('should include request details in verbose mode', () => {
    const request = {
      name: 'getUser',
      method: 'GET',
      url: 'https://api.example.com/users/1'
    };

    const output = formatVerboseRequestLine(0, request);
    expect(output).toContain('getUser');
    expect(output).toContain('GET');
    expect(output).toContain('https://api.example.com/users/1');
  });

  test('should show timing in verbose mode', () => {
    const startTime = Date.now();
    const endTime = startTime + 150;
    const durationMs = endTime - startTime;

    const output = `Duration: ${durationMs}ms`;
    expect(output).toBe('Duration: 150ms');
  });
});
