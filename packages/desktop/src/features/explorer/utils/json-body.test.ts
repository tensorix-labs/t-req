import { describe, expect, it } from 'bun:test';
import { formatJsonBodyText, validateJsonBodyText } from './json-body';

describe('validateJsonBodyText', () => {
  it('accepts JSONC comments and trailing commas', () => {
    const text = `{
  // comment
  "name": "test",
  "items": [1, 2,],
}`;
    expect(validateJsonBodyText(text)).toBeUndefined();
  });

  it('returns an error for invalid json content', () => {
    expect(validateJsonBodyText('{ invalid-json }')).toBeDefined();
  });
});

describe('formatJsonBodyText', () => {
  it('prettifies JSONC into strict JSON', () => {
    const text = `{"name":"test","items":[1,2,]}`;
    const result = formatJsonBodyText(text, 'prettify');
    expect(result).toEqual({
      ok: true,
      text: '{\n  "name": "test",\n  "items": [\n    1,\n    2\n  ]\n}'
    });
  });

  it('minifies JSONC into strict JSON', () => {
    const text = `{
  // comment
  "name": "test",
}`;
    const result = formatJsonBodyText(text, 'minify');
    expect(result).toEqual({
      ok: true,
      text: '{"name":"test"}'
    });
  });

  it('returns an error when body is invalid', () => {
    const result = formatJsonBodyText('{ invalid-json }', 'minify');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
