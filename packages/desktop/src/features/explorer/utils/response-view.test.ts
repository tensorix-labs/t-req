import { describe, expect, it } from 'bun:test';
import { isJsonContentType, toResponseBodyViewModel } from './response-view';

describe('isJsonContentType', () => {
  it('matches canonical json media types', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('text/json')).toBe(true);
    expect(isJsonContentType('application/problem+json; charset=utf-8')).toBe(true);
  });

  it('returns false for non-json media types', () => {
    expect(isJsonContentType('text/plain')).toBe(false);
    expect(isJsonContentType('text/html; charset=utf-8')).toBe(false);
  });
});

describe('toResponseBodyViewModel', () => {
  it('returns empty when body is missing', () => {
    expect(toResponseBodyViewModel(undefined, [])).toEqual({ kind: 'empty' });
  });

  it('returns json model when content-type is json and body is valid json', () => {
    expect(
      toResponseBodyViewModel('{"hello":"world"}', [
        { name: 'Content-Type', value: 'application/json; charset=utf-8' }
      ])
    ).toEqual({
      kind: 'json',
      text: '{\n  "hello": "world"\n}'
    });
  });

  it('falls back to text model when content-type is json but body is invalid json', () => {
    expect(
      toResponseBodyViewModel('{ invalid-json }', [
        { name: 'Content-Type', value: 'application/json' }
      ])
    ).toEqual({
      kind: 'text',
      text: '{ invalid-json }'
    });
  });

  it('returns json model when body is valid json even without json content-type', () => {
    expect(
      toResponseBodyViewModel('{"ok":true}', [{ name: 'Content-Type', value: 'text/plain' }])
    ).toEqual({
      kind: 'json',
      text: '{\n  "ok": true\n}'
    });
  });

  it('returns text model for non-json bodies', () => {
    expect(
      toResponseBodyViewModel('hello', [{ name: 'Content-Type', value: 'text/plain' }])
    ).toEqual({
      kind: 'text',
      text: 'hello'
    });
  });
});
