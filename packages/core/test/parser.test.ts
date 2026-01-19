import { describe, expect, test } from 'bun:test';
import { parse } from '../src/parser.ts';

describe('parse', () => {
  test('parses a simple GET request', () => {
    const requests = parse(`
GET https://api.example.com/users
`);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe('https://api.example.com/users');
  });

  test('parses headers', () => {
    const requests = parse(`
GET https://api.example.com/users
Authorization: Bearer token123
Content-Type: application/json
`);

    expect(requests[0]?.headers).toEqual({
      Authorization: 'Bearer token123',
      'Content-Type': 'application/json'
    });
  });

  test('parses request body', () => {
    const requests = parse(`
POST https://api.example.com/users
Content-Type: application/json

{"name": "John", "email": "john@example.com"}
`);

    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.body).toBe('{"name": "John", "email": "john@example.com"}');
  });

  test('parses multiple requests separated by ###', () => {
    const requests = parse(`
GET https://api.example.com/users

###

POST https://api.example.com/users
Content-Type: application/json

{"name": "John"}
`);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[1]?.method).toBe('POST');
  });

  test('extracts request name from ### comment', () => {
    const requests = parse(`
### List users
GET https://api.example.com/users
`);

    expect(requests[0]?.name).toBe('List users');
  });

  test('extracts @name directive', () => {
    const requests = parse(`
# @name listUsers
GET https://api.example.com/users
`);

    expect(requests[0]?.name).toBe('listUsers');
  });

  test('extracts meta directives', () => {
    const requests = parse(`
# @timeout 5000
# @description Test request
GET https://api.example.com/users
`);

    expect(requests[0]?.meta).toEqual({
      timeout: '5000',
      description: 'Test request'
    });
  });

  test('handles variables in URL', () => {
    const requests = parse(`
GET https://{{host}}/users/{{userId}}
`);

    expect(requests[0]?.url).toBe('https://{{host}}/users/{{userId}}');
  });

  test('handles HTTP version in request line', () => {
    const requests = parse(`
GET https://api.example.com/users HTTP/1.1
`);

    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe('https://api.example.com/users');
  });

  test('handles multiline body', () => {
    const requests = parse(`
POST https://api.example.com/users
Content-Type: application/json

{
  "name": "John",
  "email": "john@example.com"
}
`);

    expect(requests[0]?.body).toContain('"name": "John"');
    expect(requests[0]?.body).toContain('"email": "john@example.com"');
  });

  test('ignores // style comments', () => {
    const requests = parse(`
// This is a comment
GET https://api.example.com/users
`);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
  });

  test('@name takes precedence over ### comment', () => {
    const requests = parse(`
### List users
# @name getUsers
GET https://api.example.com/users
`);

    expect(requests[0]?.name).toBe('getUsers');
  });
});

describe('parse auth headers', () => {
  test('handles Authorization header with Basic auth', () => {
    const requests = parse(`
GET https://api.example.com
Authorization: Basic dXNlcjpwYXNz
`);
    expect(requests[0]?.headers.Authorization).toBe('Basic dXNlcjpwYXNz');
  });

  test('handles Authorization header with Bearer token', () => {
    const requests = parse(`
GET https://api.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs
`);
    expect(requests[0]?.headers.Authorization).toBe('Bearer eyJhbGciOiJIUzI1NiIs');
  });

  test('handles Authorization header with variable', () => {
    const requests = parse(`
GET https://api.example.com
Authorization: Bearer {{token}}
`);
    expect(requests[0]?.headers.Authorization).toBe('Bearer {{token}}');
  });

  test('handles API key in custom header', () => {
    const requests = parse(`
GET https://api.example.com
X-API-Key: sk-12345
`);
    expect(requests[0]?.headers['X-API-Key']).toBe('sk-12345');
  });

  test('handles API key in query param', () => {
    const requests = parse(`
GET https://api.example.com?api_key={{apiKey}}
`);
    expect(requests[0]?.url).toBe('https://api.example.com?api_key={{apiKey}}');
  });
});

describe('parse edge cases', () => {
  // Whitespace handling
  test('handles leading/trailing whitespace in file', () => {
    const requests = parse(`


GET https://api.example.com/users


`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.example.com/users');
  });

  test('handles CRLF line endings', () => {
    const requests = parse(
      'GET https://api.example.com/users\r\nAuthorization: Bearer token\r\n\r\n{"test": true}'
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.Authorization).toBe('Bearer token');
    expect(requests[0]?.body).toBe('{"test": true}');
  });

  test('handles mixed line endings', () => {
    const requests = parse('GET https://api.example.com\r\nHeader: value\n\nbody');
    expect(requests).toHaveLength(1);
  });

  // Empty/malformed input
  test('returns empty array for empty string', () => {
    expect(parse('')).toEqual([]);
  });

  test('returns empty array for whitespace only', () => {
    expect(parse('   \n\n   ')).toEqual([]);
  });

  test('returns empty array for comments only', () => {
    expect(parse('# just a comment\n// another comment')).toEqual([]);
  });

  test('skips blocks without valid request line', () => {
    const requests = parse(`
### Invalid block
not a valid request

###
GET https://valid.com
`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://valid.com');
  });

  // Header edge cases
  test('handles header with empty value', () => {
    const requests = parse(`
GET https://api.example.com
X-Empty-Header:
`);
    expect(requests[0]?.headers['X-Empty-Header']).toBe('');
  });

  test('handles header with colons in value', () => {
    const requests = parse(`
GET https://api.example.com
X-Time: 10:30:00
`);
    expect(requests[0]?.headers['X-Time']).toBe('10:30:00');
  });

  test('handles header with URL in value', () => {
    const requests = parse(`
GET https://api.example.com
Referer: https://other.com/path?foo=bar
`);
    expect(requests[0]?.headers.Referer).toBe('https://other.com/path?foo=bar');
  });

  test('preserves header case', () => {
    const requests = parse(`
GET https://api.example.com
X-Custom-Header: value
x-lowercase: value2
`);
    expect(requests[0]?.headers).toHaveProperty('X-Custom-Header');
    expect(requests[0]?.headers).toHaveProperty('x-lowercase');
  });

  // URL edge cases
  test('handles URL with query params', () => {
    const requests = parse(`
GET https://api.example.com/users?limit=10&offset=0
`);
    expect(requests[0]?.url).toBe('https://api.example.com/users?limit=10&offset=0');
  });

  test('handles URL with fragment', () => {
    const requests = parse(`
GET https://api.example.com/docs#section
`);
    expect(requests[0]?.url).toBe('https://api.example.com/docs#section');
  });

  test('handles URL with port', () => {
    const requests = parse(`
GET https://localhost:3000/api
`);
    expect(requests[0]?.url).toBe('https://localhost:3000/api');
  });

  test('handles URL with auth', () => {
    const requests = parse(`
GET https://user:pass@api.example.com/users
`);
    expect(requests[0]?.url).toBe('https://user:pass@api.example.com/users');
  });

  test('handles relative URL', () => {
    const requests = parse(`
GET /api/users
`);
    expect(requests[0]?.url).toBe('/api/users');
  });

  // Body edge cases
  test('handles empty body (blank line present)', () => {
    const requests = parse(`
POST https://api.example.com

`);
    expect(requests[0]?.body).toBeUndefined();
  });

  test('handles body with blank lines', () => {
    const requests = parse(`
POST https://api.example.com
Content-Type: text/plain

line 1

line 3
`);
    expect(requests[0]?.body).toBe('line 1\n\nline 3');
  });

  test('handles binary-looking body', () => {
    const requests = parse(`
POST https://api.example.com
Content-Type: application/octet-stream

<binary content placeholder>
`);
    expect(requests[0]?.body).toBe('<binary content placeholder>');
  });

  // Method edge cases
  test('handles lowercase method', () => {
    const requests = parse(`
get https://api.example.com
`);
    expect(requests[0]?.method).toBe('GET');
  });

  test('handles mixed case method', () => {
    const requests = parse(`
PoSt https://api.example.com
`);
    expect(requests[0]?.method).toBe('POST');
  });

  test('parses all HTTP methods', () => {
    const methods = [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'HEAD',
      'OPTIONS',
      'TRACE',
      'CONNECT'
    ];
    for (const method of methods) {
      const requests = parse(`${method} https://api.example.com`);
      expect(requests[0]?.method).toBe(method);
    }
  });

  // Multiple requests edge cases
  test('handles consecutive separators', () => {
    const requests = parse(`
GET https://first.com
###
###
GET https://second.com
`);
    expect(requests).toHaveLength(2);
  });

  test('handles separator at start of file', () => {
    const requests = parse(`
### First request
GET https://api.example.com
`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.name).toBe('First request');
  });

  test('handles separator at end of file', () => {
    const requests = parse(`
GET https://api.example.com
###
`);
    expect(requests).toHaveLength(1);
  });

  // Directive edge cases
  test('handles directive without value', () => {
    const requests = parse(`
# @noLog
GET https://api.example.com
`);
    expect(requests[0]?.meta.noLog).toBe('');
  });

  test('handles directive with extra whitespace', () => {
    const requests = parse(`
#   @name    spacedName
GET https://api.example.com
`);
    expect(requests[0]?.name).toBe('spacedName');
  });

  test('ignores directives after request line', () => {
    const requests = parse(`
GET https://api.example.com
# @name shouldBeIgnored
`);
    expect(requests[0]?.name).toBeUndefined();
  });

  // Comment edge cases
  test('handles # in URL (not a comment)', () => {
    const requests = parse(`
GET https://api.example.com/path#anchor
`);
    expect(requests[0]?.url).toBe('https://api.example.com/path#anchor');
  });

  test('handles // in URL (not a comment)', () => {
    const requests = parse(`
GET https://api.example.com
`);
    expect(requests[0]?.url).toBe('https://api.example.com');
  });

  // Variable edge cases
  test('handles nested variable syntax', () => {
    const requests = parse(`
GET https://{{host}}/{{path}}
Authorization: {{authType}} {{token}}
`);
    expect(requests[0]?.url).toBe('https://{{host}}/{{path}}');
    expect(requests[0]?.headers.Authorization).toBe('{{authType}} {{token}}');
  });

  test('handles variables in body', () => {
    const requests = parse(`
POST https://api.example.com
Content-Type: application/json

{"id": "{{userId}}", "timestamp": "{{$timestamp}}"}
`);
    expect(requests[0]?.body).toContain('{{userId}}');
    expect(requests[0]?.body).toContain('{{$timestamp}}');
  });

  // Real-world edge cases
  test('handles GraphQL query', () => {
    const requests = parse(`
POST https://api.example.com/graphql
Content-Type: application/json

{
  "query": "{ users { id name } }",
  "variables": {"limit": 10}
}
`);
    expect(requests[0]?.body).toContain('"query"');
  });

  test('handles form-urlencoded body', () => {
    const requests = parse(`
POST https://api.example.com/login
Content-Type: application/x-www-form-urlencoded

username=john&password=secret
`);
    expect(requests[0]?.body).toBe('username=john&password=secret');
  });
});

describe('parse URL edge cases', () => {
  test('handles IPv6 localhost', () => {
    const requests = parse(`
GET http://[::1]:3000/api
`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('http://[::1]:3000/api');
  });

  test('handles IPv6 address with query params', () => {
    const requests = parse(`
GET http://[::1]:8080/path?foo=bar&baz=qux
`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('http://[::1]:8080/path?foo=bar&baz=qux');
  });

  test('handles Unicode path', () => {
    const requests = parse(`
GET https://api.example.com/users/名前
`);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.example.com/users/名前');
  });
});

describe('parse header edge cases', () => {
  test('preserves Content-Type with charset parameter', () => {
    const requests = parse(`
POST https://api.example.com
Content-Type: text/html; charset=utf-8

<html></html>
`);
    expect(requests[0]?.headers['Content-Type']).toBe('text/html; charset=utf-8');
  });

  test('preserves Accept header with quality values', () => {
    const requests = parse(`
GET https://api.example.com
Accept: application/json, text/plain;q=0.9, */*;q=0.1
`);
    expect(requests[0]?.headers.Accept).toBe('application/json, text/plain;q=0.9, */*;q=0.1');
  });
});
