import { describe, expect, test } from 'bun:test';
import { normalizeJsonc, parseJsonc, stripJsonComments, stripTrailingCommas } from '../src/config';

describe('JSONC', () => {
  describe('stripJsonComments', () => {
    test('removes single-line comments and trims whitespace before them', () => {
      const input = `{
  "key": "value" // this is a comment
}`;

      const result = stripJsonComments(input);
      expect(result).toBe(`{
  "key": "value"
}`);
    });

    test('preserves // inside strings (URLs)', () => {
      const input = `{
  "url": "https://example.com/a//b", // comment
  "ok": true
}`;
      const result = stripJsonComments(input);
      expect(result).toBe(`{
  "url": "https://example.com/a//b",
  "ok": true
}`);
    });

    test('handles comment at end of file without newline', () => {
      const input = `{"a":1}// comment with no trailing newline`;
      const result = stripJsonComments(input);
      expect(result).toBe(`{"a":1}`);
    });
  });

  describe('parseJsonc', () => {
    test('parses JSONC with comments', () => {
      const input = `{
  // comment
  "a": 1,
  "b": "two" // trailing comment
}`;
      const parsed = parseJsonc<{ a: number; b: string }>(input);
      expect(parsed).toEqual({ a: 1, b: 'two' });
    });

    test('parses JSONC with trailing commas', () => {
      const input = `{
  "a": 1,
  "b": [1, 2,],
}`;
      const parsed = parseJsonc<{ a: number; b: number[] }>(input);
      expect(parsed).toEqual({ a: 1, b: [1, 2] });
    });
  });

  describe('stripTrailingCommas', () => {
    test('removes trailing commas from objects and arrays', () => {
      const input = `{
  "a": 1,
  "b": [
    1,
    2,
  ],
}`;
      expect(stripTrailingCommas(input)).toBe(`{
  "a": 1,
  "b": [
    1,
    2
  ]
}`);
    });

    test('preserves commas inside strings', () => {
      const input = `{"text":"a,b,","items":[1,2,]}`;
      expect(stripTrailingCommas(input)).toBe(`{"text":"a,b,","items":[1,2]}`);
    });
  });

  describe('normalizeJsonc', () => {
    test('normalizes JSONC into strict JSON text', () => {
      const input = `{
  // comment
  "a": 1,
  "b": [2,],
}`;
      expect(normalizeJsonc(input)).toBe('{"a":1,"b":[2]}');
    });
  });
});
