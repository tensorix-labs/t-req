import { describe, expect, it } from 'bun:test';
import { extractFilename } from '../../../src/tui/util/path';

describe('extractFilename', () => {
  it('extracts filename from a unix path', () => {
    expect(extractFilename('/home/user/script.ts')).toBe('script.ts');
  });

  it('returns the string itself when there are no slashes', () => {
    expect(extractFilename('script.ts')).toBe('script.ts');
  });

  it('returns fallback for empty string', () => {
    expect(extractFilename('', 'default')).toBe('default');
  });

  it('returns empty string fallback by default', () => {
    expect(extractFilename('')).toBe('');
  });

  it('returns fallback for trailing slash', () => {
    expect(extractFilename('/home/user/', 'fallback')).toBe('fallback');
  });

  it('handles deeply nested paths', () => {
    expect(extractFilename('/a/b/c/d/e/file.json')).toBe('file.json');
  });
});
