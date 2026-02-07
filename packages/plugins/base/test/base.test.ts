import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createPluginManager } from '@t-req/core/plugin';
import { base } from '../src/index';

const resolvers = base.resolvers;

const expectString = (value: unknown) => {
  expect(typeof value).toBe('string');
};

describe('exports', () => {
  test('all resolvers are callable functions', () => {
    const names = Object.keys(resolvers);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      expect(typeof (resolvers as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('$uuid', () => {
  const $uuid = resolvers['$uuid'];

  test('returns valid UUID v4 format', () => {
    const uuid = $uuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('generates unique values', () => {
    const uuids = new Set(Array.from({ length: 100 }, () => $uuid()));
    expect(uuids.size).toBe(100);
  });

  test('returns string type', () => {
    expectString($uuid());
  });
});

describe('$timestamp', () => {
  const $timestamp = resolvers['$timestamp'];

  test('returns unix timestamp as string', () => {
    const result = $timestamp();
    const ts = Number(result);
    const now = Math.floor(Date.now() / 1000);

    expectString(result);
    expect(Number.isInteger(ts)).toBe(true);
    expect(ts).toBeGreaterThan(0);
    expect(Math.abs(ts - now)).toBeLessThanOrEqual(1);
  });
});

describe('$timestampMs', () => {
  const $timestampMs = resolvers['$timestampMs'];

  test('returns millisecond timestamp as string', () => {
    const result = $timestampMs();
    const ts = Number(result);
    const now = Date.now();

    expectString(result);
    expect(ts).toBeGreaterThan(0);
    expect(Math.abs(ts - now)).toBeLessThanOrEqual(100);
  });
});

describe('$isodate', () => {
  const $isodate = resolvers['$isodate'];

  test('returns parseable ISO 8601 datetime', () => {
    const result = $isodate();
    const date = new Date(result);

    expectString(result);
    expect(date.toISOString()).toBe(result);
  });
});

describe('$randomInt', () => {
  const $randomInt = resolvers['$randomInt'];

  test('returns integer within specified range', () => {
    for (let i = 0; i < 50; i++) {
      const result = Number($randomInt('1', '100'));
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(100);
    }
  });

  test('handles negative ranges', () => {
    for (let i = 0; i < 20; i++) {
      const result = Number($randomInt('-100', '-1'));
      expect(result).toBeGreaterThanOrEqual(-100);
      expect(result).toBeLessThanOrEqual(-1);
    }
  });

  test('handles single value range (min === max)', () => {
    const result = Number($randomInt('42', '42'));
    expect(result).toBe(42);
  });

  test('generates varied results over multiple calls', () => {
    const results = new Set(Array.from({ length: 50 }, () => $randomInt('1', '1000')));
    expect(results.size).toBeGreaterThan(10);
  });

  test('returns string type', () => {
    expectString($randomInt('1', '10'));
  });

  test('handles decimal string arguments by truncating', () => {
    const result = Number($randomInt('1.9', '10.1'));
    // Decimal args are truncated to integers (1 and 10)
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(10);
  });
});

describe('$base64', () => {
  const $base64 = resolvers['$base64'];

  const testCases = [
    { input: 'hello', expected: 'aGVsbG8=' },
    { input: '', expected: '' },
    { input: 'Hello, World!', expected: 'SGVsbG8sIFdvcmxkIQ==' },
    { input: 'special!@#$%^&*()', expected: 'c3BlY2lhbCFAIyQlXiYqKCk=' },
    { input: '1234567890', expected: 'MTIzNDU2Nzg5MA==' },
    { input: 'Line 1\nLine 2\r\n', expected: 'TGluZSAxCkxpbmUgMg0K' }
  ];

  testCases.forEach(({ input, expected }) => {
    test(`encodes "${input.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`, () => {
      expect($base64(input)).toBe(expected);
    });
  });

  test('returns string type', () => {
    expectString($base64('test'));
  });
});

describe('$base64Decode', () => {
  const $base64Decode = resolvers['$base64Decode'];

  const testCases = [
    { input: 'aGVsbG8=', expected: 'hello' },
    { input: '', expected: '' },
    { input: 'SGVsbG8sIFdvcmxkIQ==', expected: 'Hello, World!' },
    { input: 'c3BlY2lhbCFAIyQlXiYqKCk=', expected: 'special!@#$%^&*()' },
    { input: 'MTIzNDU2Nzg5MA==', expected: '1234567890' }
  ];

  testCases.forEach(({ input, expected }) => {
    test(`decodes "${input}"`, () => {
      expect($base64Decode(input)).toBe(expected);
    });
  });

  test('round-trips with $base64', () => {
    const $base64 = resolvers['$base64'];
    const original = 'Test message with special chars! @#$%';
    const encoded = $base64(original);
    const decoded = $base64Decode(encoded);
    expect(decoded).toBe(original);
  });

  test('returns string type', () => {
    expectString($base64Decode('dGVzdA=='));
  });
});

describe('$env', () => {
  const $env = resolvers['$env'];
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear and set known env vars for testing
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    process.env['TEST_VAR'] = 'test_value';
    process.env['EMPTY_VAR'] = '';
    process.env['WHITESPACE_VAR'] = '  spaces  ';
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  test('returns value of existing env variable', () => {
    expect($env('TEST_VAR')).toBe('test_value');
  });

  test('returns empty string for nonexistent variable', () => {
    expect($env('DEFINITELY_NOT_SET_xyz')).toBe('');
  });

  test('returns empty string when variable is set to empty string', () => {
    expect($env('EMPTY_VAR')).toBe('');
  });

  test('preserves whitespace in values', () => {
    expect($env('WHITESPACE_VAR')).toBe('  spaces  ');
  });

  test('returns string type for existing variable', () => {
    expectString($env('TEST_VAR'));
  });

  test('returns string type for nonexistent variable', () => {
    expectString($env('NOT_SET'));
  });

  test('handles variable names with underscores', () => {
    process.env['MY_TEST_VAR_123'] = 'value123';
    expect($env('MY_TEST_VAR_123')).toBe('value123');
  });
});

// ============================================================================
// Integration Tests — PluginManager
// ============================================================================

describe('integration with PluginManager', () => {
  let pm: ReturnType<typeof createPluginManager>;

  beforeEach(async () => {
    pm = createPluginManager({
      projectRoot: process.cwd(),
      plugins: [base]
    });
    await pm.initialize();
  });

  afterEach(async () => {
    await pm.teardown();
  });

  test('registers all resolvers', () => {
    const pmResolvers = pm.getResolvers();
    expect(Object.keys(pmResolvers).length).toBeGreaterThan(0);
  });

  test('callResolver $uuid returns valid UUID', async () => {
    const uuid = await pm.callResolver('$uuid', []);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('callResolver $base64 encodes correctly', async () => {
    const result = await pm.callResolver('$base64', ['hello']);
    expect(result).toBe('aGVsbG8=');
  });

  test('callResolver $base64Decode decodes correctly', async () => {
    const result = await pm.callResolver('$base64Decode', ['aGVsbG8=']);
    expect(result).toBe('hello');
  });

  test('callResolver $timestamp returns numeric string', async () => {
    const result = await pm.callResolver('$timestamp', []);
    expectString(result);
    expect(Number(result)).toBeGreaterThan(0);
  });

  test('callResolver $timestampMs returns numeric string', async () => {
    const result = await pm.callResolver('$timestampMs', []);
    expectString(result);
    expect(Number(result)).toBeGreaterThan(0);
  });

  test('callResolver $isodate returns parseable date', async () => {
    const result = await pm.callResolver('$isodate', []);
    const date = new Date(result);
    expect(date.toISOString()).toBe(result);
  });

  test('callResolver $randomInt with args returns integer string', async () => {
    const result = await pm.callResolver('$randomInt', ['1', '100']);
    expectString(result);
    const num = Number(result);
    expect(Number.isInteger(num)).toBe(true);
    expect(num).toBeGreaterThanOrEqual(1);
    expect(num).toBeLessThanOrEqual(100);
  });

  test('callResolver $env returns env value', async () => {
    process.env['INTEGRATION_TEST'] = 'it_works';
    const result = await pm.callResolver('$env', ['INTEGRATION_TEST']);
    expect(result).toBe('it_works');
    delete process.env['INTEGRATION_TEST'];
  });

  test('handles concurrent resolver calls', async () => {
    const promises = Array.from({ length: 100 }, () => pm.callResolver('$uuid', []));
    const uuids = await Promise.all(promises);
    const uniqueUuids = new Set(uuids);
    expect(uniqueUuids.size).toBe(100);
  });

  test('handles multiple different resolvers concurrently', async () => {
    const results = await Promise.all([
      pm.callResolver('$base64', ['test1']),
      pm.callResolver('$base64', ['test2']),
      pm.callResolver('$uuid', []),
      pm.callResolver('$timestamp', [])
    ]);

    expect(results[0]).toBe('dGVzdDE=');
    expect(results[1]).toBe('dGVzdDI=');
    expect(results[2]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Number(results[3])).toBeGreaterThan(0);
  });
});
