import { describe, expect, it } from 'bun:test';
import {
  deriveRequestLineFromContent,
  FALLBACK_REQUEST_METHOD,
  FALLBACK_REQUEST_URL
} from './request-line';

describe('deriveRequestLineFromContent', () => {
  it('parses a simple request line', () => {
    expect(deriveRequestLineFromContent('GET https://api.example.com')).toEqual({
      method: 'GET',
      url: 'https://api.example.com'
    });
  });

  it('normalizes lowercase methods', () => {
    expect(deriveRequestLineFromContent('post https://api.example.com/users')).toEqual({
      method: 'POST',
      url: 'https://api.example.com/users'
    });
  });

  it('ignores directives and comments before request line', () => {
    const content = [
      '# @name listUsers',
      '@baseUrl = https://api.example.com',
      '',
      'GET {{baseUrl}}/users'
    ].join('\n');

    expect(deriveRequestLineFromContent(content)).toEqual({
      method: 'GET',
      url: '{{baseUrl}}/users'
    });
  });

  it('parses request lines with HTTP version suffix', () => {
    expect(deriveRequestLineFromContent('GET https://api.example.com/users HTTP/1.1')).toEqual({
      method: 'GET',
      url: 'https://api.example.com/users'
    });
  });

  it('returns fallback when content is empty or invalid', () => {
    const fallback = {
      method: FALLBACK_REQUEST_METHOD,
      url: FALLBACK_REQUEST_URL
    };

    expect(deriveRequestLineFromContent('')).toEqual(fallback);
    expect(deriveRequestLineFromContent('Authorization: Bearer token')).toEqual(fallback);
    expect(deriveRequestLineFromContent(undefined)).toEqual(fallback);
  });
});
