import { describe, expect, test } from 'bun:test';
import {
  buildAuthHeaders,
  buildUrl,
  deduplicatePath,
  slugify
} from '../../src/import/normalize.ts';

describe('slugify', () => {
  test('lowercases, trims, and replaces separators with hyphens', () => {
    expect(slugify('  Users API / List  ')).toBe('users-api-list');
  });

  test('removes accents and strips non-alphanumeric characters', () => {
    expect(slugify('Crème brûlée @ v2!')).toBe('creme-brulee-v2');
  });

  test('returns fallback when input has no slug characters', () => {
    expect(slugify('***')).toBe('untitled');
  });
});

describe('deduplicatePath', () => {
  test('returns original path when not present and tracks it', () => {
    const existing = new Set<string>();
    expect(deduplicatePath('users/list.http', existing)).toBe('users/list.http');
    expect(existing.has('users/list.http')).toBe(true);
  });

  test('appends numeric suffix while preserving extension', () => {
    const existing = new Set<string>(['users/list.http', 'users/list-2.http']);
    expect(deduplicatePath('users/list.http', existing)).toBe('users/list-3.http');
  });

  test('handles filenames without extension', () => {
    const existing = new Set<string>(['users/list', 'users/list-2']);
    expect(deduplicatePath('users/list', existing)).toBe('users/list-3');
  });
});

describe('buildAuthHeaders', () => {
  test('builds bearer auth header', () => {
    expect(buildAuthHeaders('bearer', { token: 'abc123' })).toEqual({
      Authorization: 'Bearer abc123'
    });
  });

  test('builds basic auth header', () => {
    expect(buildAuthHeaders('basic', { username: 'user', password: 'pass' })).toEqual({
      Authorization: 'Basic dXNlcjpwYXNz'
    });
  });

  test('builds apikey header only when `in` is header', () => {
    expect(buildAuthHeaders('apikey', { key: 'X-API-Key', value: 'secret', in: 'header' })).toEqual(
      {
        'X-API-Key': 'secret'
      }
    );
    expect(buildAuthHeaders('apikey', { key: 'api_key', value: 'secret', in: 'query' })).toEqual(
      {}
    );
  });
});

describe('buildUrl', () => {
  test('builds URL from protocol/host/path/query/hash', () => {
    const url = buildUrl({
      protocol: 'https',
      host: ['api', 'example', 'com'],
      path: ['users', 'list'],
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '20' },
        { key: 'disabled', value: 'x', disabled: true }
      ],
      hash: 'top'
    });

    expect(url).toBe('https://api.example.com/users/list?page=1&limit=20#top');
  });

  test('builds relative path when host is absent', () => {
    const url = buildUrl({
      path: ['users', '42'],
      query: [{ key: 'expand', value: 'teams' }]
    });

    expect(url).toBe('/users/42?expand=teams');
  });

  test('falls back to raw URL when structured parts are missing', () => {
    expect(buildUrl({ raw: 'https://api.example.com/raw' })).toBe('https://api.example.com/raw');
  });
});
