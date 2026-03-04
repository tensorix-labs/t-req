import { describe, expect, test } from 'bun:test';
import { getFileType, isHttpFile, isRunnableScript, isTestFile } from '../../src/utils/file-type';

describe('file-type utilities', () => {
  test('classifies http files', () => {
    expect(getFileType('collection/users/list.http')).toBe('http');
    expect(isHttpFile('collection/users/list.http')).toBe(true);
  });

  test('classifies test files before script files', () => {
    expect(getFileType('tests/users/get.test.ts')).toBe('test');
    expect(getFileType('tests/users/get.spec.js')).toBe('test');
    expect(getFileType('tests/test_api.py')).toBe('test');
    expect(isTestFile('tests/users/get.test.ts')).toBe(true);
  });

  test('classifies runnable scripts', () => {
    expect(getFileType('scripts/run.ts')).toBe('script');
    expect(getFileType('scripts/run.py')).toBe('script');
    expect(isRunnableScript('scripts/run.ts')).toBe(true);
  });

  test('classifies unsupported files as other', () => {
    expect(getFileType('README.md')).toBe('other');
    expect(isHttpFile('README.md')).toBe(false);
    expect(isRunnableScript('README.md')).toBe(false);
  });
});
