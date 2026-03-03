import { describe, expect, test } from 'bun:test';
import { formatJsonBodyText, validateJsonBodyText } from './request-body-json';

describe('validateJsonBodyText', () => {
  test('accepts JSONC comments and trailing commas', () => {
    const text = `{
  // comment
  "name": "test",
  "items": [1, 2,],
}`;
    expect(validateJsonBodyText(text)).toBeUndefined();
  });

  test('accepts template placeholders in value positions', () => {
    const text = `{
  "id": {{user.id}},
  "token": {{$uuid()}},
  "name": "{{user.name}}"
}`;
    expect(validateJsonBodyText(text)).toBeUndefined();
  });

  test('returns an error for invalid json content', () => {
    expect(validateJsonBodyText('{ invalid-json }')).toBeDefined();
  });
});

describe('formatJsonBodyText', () => {
  test('prettifies JSONC into strict JSON', () => {
    const text = `{"name":"test","items":[1,2,]}`;
    const result = formatJsonBodyText(text, 'prettify');
    expect(result).toEqual({
      ok: true,
      text: '{\n  "name": "test",\n  "items": [\n    1,\n    2\n  ]\n}'
    });
  });

  test('minifies JSONC into strict JSON', () => {
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

  test('preserves template placeholders while formatting', () => {
    const text = `{
  "id": {{user.id}},
  "token": {{$uuid()}},
  "name": "{{user.name}}",
}`;

    const result = formatJsonBodyText(text, 'minify');
    expect(result).toEqual({
      ok: true,
      text: '{"id":{{user.id}},"token":{{$uuid()}},"name":"{{user.name}}"}'
    });
  });

  test('does not rewrite real string values that look like placeholders', () => {
    const text = `{
  "literal": "__treq_template_placeholder_0__",
  "id": {{user.id}}
}`;

    const result = formatJsonBodyText(text, 'minify');
    expect(result).toEqual({
      ok: true,
      text: '{"literal":"__treq_template_placeholder_0__","id":{{user.id}}}'
    });
  });

  test('returns an error when body is invalid', () => {
    const result = formatJsonBodyText('{ invalid-json }', 'minify');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
