import { describe, expect, it } from 'bun:test';
import { decodeResponseBody, formatBytes, formatDuration, formatResponseBody } from './response';

describe('formatDuration', () => {
  it('formats millisecond durations under one second', () => {
    expect(formatDuration(80)).toBe('80 ms');
  });

  it('formats durations above one second', () => {
    expect(formatDuration(1200)).toBe('1.20 s');
  });
});

describe('formatBytes', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(300)).toBe('300 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});

describe('decodeResponseBody', () => {
  it('returns undefined when body is missing', () => {
    expect(decodeResponseBody({ body: undefined, encoding: 'utf-8' })).toBe(undefined);
  });

  it('returns utf-8 body as-is', () => {
    expect(decodeResponseBody({ body: 'hello', encoding: 'utf-8' })).toBe('hello');
  });

  it('decodes base64 body', () => {
    expect(decodeResponseBody({ body: 'aGVsbG8=', encoding: 'base64' })).toBe('hello');
  });
});

describe('formatResponseBody', () => {
  it('pretty-prints json', () => {
    expect(formatResponseBody('{"hello":"world"}')).toBe('{\n  "hello": "world"\n}');
  });

  it('returns raw string for non-json values', () => {
    expect(formatResponseBody('hello')).toBe('hello');
  });
});
