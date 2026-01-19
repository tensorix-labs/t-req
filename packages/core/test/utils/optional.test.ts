import { describe, expect, test } from 'bun:test';
import { setOptional } from '../../src/utils/optional.ts';

describe('setOptional', () => {
  describe('basic usage', () => {
    test('returns base object when no modifications', () => {
      const result = setOptional({ a: 1, b: 2 }).build();
      expect(result).toEqual({ a: 1, b: 2 });
    });

    test('does not mutate the original base object', () => {
      const base = { a: 1 };
      setOptional(base)
        .ifDefined('b' as keyof typeof base, 2 as never)
        .build();
      expect(base).toEqual({ a: 1 });
    });
  });

  describe('ifDefined', () => {
    test('adds property when value is defined', () => {
      interface TestObj {
        required: string;
        optional?: number;
      }
      const result = setOptional<TestObj>({ required: 'test' }).ifDefined('optional', 42).build();
      expect(result).toEqual({ required: 'test', optional: 42 });
    });

    test('does not add property when value is undefined', () => {
      interface TestObj {
        required: string;
        optional?: number;
      }
      const result = setOptional<TestObj>({ required: 'test' })
        .ifDefined('optional', undefined)
        .build();
      expect(result).toEqual({ required: 'test' });
      expect('optional' in result).toBe(false);
    });

    test('adds property when value is null', () => {
      interface TestObj {
        required: string;
        optional?: string | null;
      }
      const result = setOptional<TestObj>({ required: 'test' }).ifDefined('optional', null).build();
      expect(result).toEqual({ required: 'test', optional: null });
    });

    test('adds property when value is falsy but defined', () => {
      interface TestObj {
        required: string;
        zero?: number;
        empty?: string;
        falsy?: boolean;
      }
      const result = setOptional<TestObj>({ required: 'test' })
        .ifDefined('zero', 0)
        .ifDefined('empty', '')
        .ifDefined('falsy', false)
        .build();
      expect(result).toEqual({ required: 'test', zero: 0, empty: '', falsy: false });
    });

    test('supports chaining multiple ifDefined calls', () => {
      interface TestObj {
        base: string;
        a?: number;
        b?: string;
        c?: boolean;
      }
      const result = setOptional<TestObj>({ base: 'test' })
        .ifDefined('a', 1)
        .ifDefined('b', 'two')
        .ifDefined('c', true)
        .build();
      expect(result).toEqual({ base: 'test', a: 1, b: 'two', c: true });
    });

    test('later ifDefined calls override earlier ones', () => {
      interface TestObj {
        value: number;
      }
      const result = setOptional<TestObj>({ value: 1 })
        .ifDefined('value', 2)
        .ifDefined('value', 3)
        .build();
      expect(result).toEqual({ value: 3 });
    });
  });

  describe('when', () => {
    test('adds properties when condition is true', () => {
      interface TestObj {
        base: string;
        extra?: string;
      }
      const result = setOptional<TestObj>({ base: 'test' }).when(true, { extra: 'added' }).build();
      expect(result).toEqual({ base: 'test', extra: 'added' });
    });

    test('does not add properties when condition is false', () => {
      interface TestObj {
        base: string;
        extra?: string;
      }
      const result = setOptional<TestObj>({ base: 'test' })
        .when(false, { extra: 'not added' })
        .build();
      expect(result).toEqual({ base: 'test' });
      expect('extra' in result).toBe(false);
    });

    test('can add multiple properties at once', () => {
      interface TestObj {
        base: string;
        a?: number;
        b?: string;
      }
      const result = setOptional<TestObj>({ base: 'test' }).when(true, { a: 1, b: 'two' }).build();
      expect(result).toEqual({ base: 'test', a: 1, b: 'two' });
    });

    test('supports chaining when calls', () => {
      interface TestObj {
        base: string;
        a?: number;
        b?: string;
      }
      const result = setOptional<TestObj>({ base: 'test' })
        .when(true, { a: 1 })
        .when(false, { b: 'skipped' })
        .build();
      expect(result).toEqual({ base: 'test', a: 1 });
    });
  });

  describe('mixed usage', () => {
    test('supports mixing when and ifDefined', () => {
      interface TestObj {
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: string;
        timeout?: number;
      }
      const hasHeaders = true;
      const body: string | undefined = 'request body';
      const timeout: number | undefined = undefined;

      const result = setOptional<TestObj>({ method: 'POST', url: '/api' })
        .when(hasHeaders, { headers: { 'Content-Type': 'application/json' } })
        .ifDefined('body', body)
        .ifDefined('timeout', timeout)
        .build();

      expect(result).toEqual({
        method: 'POST',
        url: '/api',
        headers: { 'Content-Type': 'application/json' },
        body: 'request body'
      });
    });

    test('later calls override earlier ones regardless of method', () => {
      interface TestObj {
        value: number;
      }
      const result = setOptional<TestObj>({ value: 1 })
        .when(true, { value: 2 })
        .ifDefined('value', 3)
        .when(true, { value: 4 })
        .build();
      expect(result).toEqual({ value: 4 });
    });
  });

  describe('type safety', () => {
    test('preserves base object type', () => {
      interface Request {
        method: string;
        url: string;
        body?: string;
      }

      const result: Request = setOptional<Request>({ method: 'GET', url: '/test' })
        .ifDefined('body', 'data')
        .build();

      expect(result.method).toBe('GET');
      expect(result.url).toBe('/test');
      expect(result.body).toBe('data');
    });
  });
});
