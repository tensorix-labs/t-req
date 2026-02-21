import { describe, expect, it } from 'bun:test';
import { normalizeRelativePath, parentDirectory, pathFilename, trimHttpExtension } from './path';

describe('normalizeRelativePath', () => {
  it('normalizes separators and trims empty segments', () => {
    expect(normalizeRelativePath('/requests\\users//one.http')).toBe('requests/users/one.http');
  });
});

describe('parentDirectory', () => {
  it('returns empty for root-level files', () => {
    expect(parentDirectory('one.http')).toBe('');
  });

  it('returns containing directory for nested files', () => {
    expect(parentDirectory('requests/users/one.http')).toBe('requests/users');
  });
});

describe('pathFilename', () => {
  it('extracts the filename from a nested path', () => {
    expect(pathFilename('requests/users/one.http')).toBe('one.http');
  });
});

describe('trimHttpExtension', () => {
  it('removes .http suffix when present', () => {
    expect(trimHttpExtension('one.http')).toBe('one');
    expect(trimHttpExtension('ONE.HTTP')).toBe('ONE');
  });

  it('returns original filename when suffix is missing', () => {
    expect(trimHttpExtension('one')).toBe('one');
  });
});
