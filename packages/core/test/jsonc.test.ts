import { describe, expect, test } from 'bun:test';
import { parseJsonc, stripJsonComments } from '../src/config';

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
  });
});
