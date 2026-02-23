import { describe, expect, it } from 'bun:test';
import {
  isHttpProtocol,
  toRequestIndex,
  toRequestOption,
  toRequestOptionLabel
} from './request-workspace';

describe('isHttpProtocol', () => {
  it('returns true for http and undefined protocols', () => {
    expect(isHttpProtocol(undefined)).toBe(true);
    expect(isHttpProtocol('http')).toBe(true);
  });

  it('returns false for non-http protocols', () => {
    expect(isHttpProtocol('sse')).toBe(false);
    expect(isHttpProtocol('ws')).toBe(false);
  });
});

describe('toRequestOptionLabel', () => {
  it('uses request name when available', () => {
    expect(
      toRequestOptionLabel({
        index: 0,
        name: 'List users',
        method: 'get',
        url: 'https://api.example.com/users'
      })
    ).toBe('1. List users');
  });

  it('falls back to METHOD URL when name is missing', () => {
    expect(
      toRequestOptionLabel({
        index: 1,
        method: 'post',
        url: 'https://api.example.com/users'
      })
    ).toBe('2. POST https://api.example.com/users');
  });
});

describe('toRequestOption', () => {
  it('maps request summary into request option', () => {
    expect(
      toRequestOption({
        index: 2,
        method: 'get',
        url: 'https://api.example.com/health',
        protocol: 'http'
      })
    ).toEqual({
      index: 2,
      label: '3. GET https://api.example.com/health',
      protocol: 'http'
    });
  });
});

describe('toRequestIndex', () => {
  it('parses integer values', () => {
    expect(toRequestIndex('0')).toBe(0);
    expect(toRequestIndex('12')).toBe(12);
  });

  it('returns undefined for invalid values', () => {
    expect(toRequestIndex('')).toBe(undefined);
    expect(toRequestIndex('abc')).toBe(undefined);
  });
});
