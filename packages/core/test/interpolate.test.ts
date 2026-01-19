import { describe, expect, test } from 'bun:test';
import { createInterpolator, interpolate } from '../src/interpolate.ts';

describe('interpolate', () => {
  test('interpolates simple variables in string', () => {
    const result = interpolate('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  test('interpolates multiple variables', () => {
    const result = interpolate('{{greeting}} {{name}}!', {
      greeting: 'Hello',
      name: 'World'
    });
    expect(result).toBe('Hello World!');
  });

  test('interpolates nested object values', () => {
    const result = interpolate('User: {{user.name}}', {
      user: { name: 'John' }
    });
    expect(result).toBe('User: John');
  });

  test('interpolates variables in objects', () => {
    const result = interpolate(
      {
        url: 'https://{{host}}/api',
        headers: { Authorization: 'Bearer {{token}}' }
      },
      { host: 'example.com', token: 'abc123' }
    );

    expect(result.url).toBe('https://example.com/api');
    expect(result.headers.Authorization).toBe('Bearer abc123');
  });

  test('interpolates variables in arrays', () => {
    const result = interpolate(['{{a}}', '{{b}}'], { a: '1', b: '2' });
    expect(result).toEqual(['1', '2']);
  });

  test('throws on undefined variable by default', () => {
    expect(() => {
      interpolate('Hello {{name}}!', {});
    }).toThrow('Undefined variable: name');
  });

  test('keeps undefined variable with undefinedBehavior: keep', () => {
    const result = interpolate('Hello {{name}}!', {}, { undefinedBehavior: 'keep' });
    expect(result).toBe('Hello {{name}}!');
  });

  test('replaces undefined variable with empty string with undefinedBehavior: empty', () => {
    const result = interpolate('Hello {{name}}!', {}, { undefinedBehavior: 'empty' });
    expect(result).toBe('Hello !');
  });

  test('uses custom resolver', () => {
    const result = interpolate(
      'Secret: {{$env(API_KEY)}}',
      {},
      {
        resolvers: {
          $env: (key) => (key === 'API_KEY' ? 'secret123' : '')
        }
      }
    );
    expect(result).toBe('Secret: secret123');
  });

  test('throws for unknown resolver', () => {
    expect(() => {
      interpolate('{{$unknown(key)}}', {});
    }).toThrow('Unknown resolver: $unknown');
  });

  test('resolver with no arguments', () => {
    const result = interpolate(
      'ID: {{$uuid()}}',
      {},
      {
        resolvers: { $uuid: () => 'test-uuid-123' }
      }
    );
    expect(result).toBe('ID: test-uuid-123');
  });

  test('resolver with multiple arguments', () => {
    const result = interpolate(
      '{{$join(a, b, c)}}',
      {},
      {
        resolvers: { $join: (...args) => args.join('-') }
      }
    );
    expect(result).toBe('a-b-c');
  });

  test('resolver with numeric arguments', () => {
    const result = interpolate(
      '{{$range(5, 10)}}',
      {},
      {
        resolvers: { $range: (min, max) => `${min}-${max}` }
      }
    );
    expect(result).toBe('5-10');
  });

  test('preserves non-string values', () => {
    const result = interpolate({ count: 42, active: true }, {});
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
  });
});

describe('createInterpolator', () => {
  test('creates reusable interpolator', async () => {
    const interp = createInterpolator({
      resolvers: {
        $upper: (key) => key.toUpperCase()
      }
    });

    const result = await interp.interpolate('{{$upper(hello)}}', {});
    expect(result).toBe('HELLO');
  });

  test('supports async resolvers', async () => {
    const interp = createInterpolator({
      resolvers: {
        $async: async (key) => {
          await new Promise((r) => setTimeout(r, 1));
          return `resolved:${key}`;
        }
      }
    });

    const result = await interp.interpolate('{{$async(test)}}', {});
    expect(result).toBe('resolved:test');
  });

  test('interpolates nested async values', async () => {
    const interp = createInterpolator({
      resolvers: {
        $fetch: async (key) => `value:${key}`
      }
    });

    const result = await interp.interpolate(
      {
        a: '{{$fetch(one)}}',
        b: { c: '{{$fetch(two)}}' }
      },
      {}
    );

    expect(result.a).toBe('value:one');
    expect(result.b.c).toBe('value:two');
  });
});
