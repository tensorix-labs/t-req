import { describe, expect, test } from 'bun:test';
import { buildUrlWithQueryRows } from './request-editing';

describe('buildUrlWithQueryRows', () => {
  test('replaces the existing query string with edited params', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/users?tag=one&page=1', [
        { key: 'tag', value: 'two', hasValue: true },
        { key: 'page', value: '2', hasValue: true }
      ])
    ).toBe('https://api.example.com/users?tag=two&page=2');
  });

  test('preserves hash fragments while updating params', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search?q=one#results', [
        { key: 'q', value: 'two words', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?q=two%20words#results');
  });

  test('preserves flag params without forcing an equals sign', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search?flag&empty=', [
        { key: 'flag', value: '', hasValue: false },
        { key: 'empty', value: '', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?flag&empty=');
  });

  test('drops blank param names', () => {
    expect(
      buildUrlWithQueryRows('https://api.example.com/search?existing=1', [
        { key: ' ', value: 'ignored', hasValue: true },
        { key: 'page', value: '1', hasValue: true }
      ])
    ).toBe('https://api.example.com/search?page=1');
  });
});
