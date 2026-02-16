import { describe, expect, test } from 'bun:test';
import { parse, parseDocument } from '../src/parser.ts';
import {
  type SerializableDocument,
  serializeDocument,
  serializeRequest
} from '../src/serializer.ts';
import type { ParsedDocument, ParsedRequest } from '../src/types.ts';

interface NormalizedRequest {
  name?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyFile?: { path: string };
  formData?: Array<{
    name: string;
    value: string;
    isFile: boolean;
    path?: string;
    filename?: string;
  }>;
  meta?: Record<string, string>;
  directives?: Array<{ name: string; value: string }>;
  protocol?: ParsedRequest['protocol'];
  protocolOptions?: ParsedRequest['protocolOptions'];
}

function normalizeRequest(request: ParsedRequest): NormalizedRequest {
  const normalized: NormalizedRequest = {
    method: request.method,
    url: request.url,
    headers: request.headers
  };

  if (request.name !== undefined) {
    normalized.name = request.name;
  }
  if (request.body !== undefined) {
    normalized.body = request.body;
  }
  if (request.bodyFile !== undefined) {
    normalized.bodyFile = request.bodyFile;
  }
  if (request.formData !== undefined) {
    normalized.formData = request.formData;
  }
  if (Object.keys(request.meta).length > 0) {
    normalized.meta = request.meta;
  }
  if (request.directives && request.directives.length > 0) {
    normalized.directives = request.directives.map(({ name, value }) => ({ name, value }));
  }
  if (request.protocol !== undefined) {
    normalized.protocol = request.protocol;
  }
  if (request.protocolOptions !== undefined) {
    normalized.protocolOptions = request.protocolOptions;
  }

  return normalized;
}

function normalizeDocument(document: ParsedDocument): {
  fileVariables: Record<string, string>;
  requests: NormalizedRequest[];
} {
  return {
    fileVariables: document.fileVariables,
    requests: document.requests.map((request) => normalizeRequest(request))
  };
}

describe('serializer', () => {
  test('semantic round-trip: parse -> serialize -> parse keeps normalized shape', () => {
    const source = `@host = api.example.com
@token = abc123

### List users
# @tag read
GET https://{{host}}/users
Authorization: Bearer {{token}}

### Create user
# @name createUser
# @description Create a user in API
POST https://{{host}}/users
Content-Type: application/json

{"name":"Ada"}`;

    const parsed = parseDocument(source);
    const serialized = serializeDocument(parsed);
    const reparsed = parseDocument(serialized);

    expect(normalizeDocument(reparsed)).toEqual(normalizeDocument(parsed));
  });

  test('single-request document does not emit ### separator', () => {
    const serialized = serializeDocument({
      requests: [{ name: 'listUsers', method: 'GET', url: 'https://api.example.com/users' }]
    });

    expect(serialized).toBe('# @name listUsers\nGET https://api.example.com/users\n');
    expect(serialized).not.toContain('###');
  });

  test('multi-request document emits ### separator with request names', () => {
    const serialized = serializeDocument({
      requests: [
        { name: 'listUsers', method: 'GET', url: 'https://api.example.com/users' },
        { name: 'createUser', method: 'POST', url: 'https://api.example.com/users' }
      ]
    });

    expect(serialized.match(/^###/gm)).toHaveLength(2);
    expect(serialized).toContain('### listUsers');
    expect(serialized).toContain('### createUser');
  });

  test('serializes raw body with one blank line after headers and no trailing newline', () => {
    const serialized = serializeRequest({
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"Ada"}'
    });

    expect(serialized).toBe(
      'POST https://api.example.com/users\nContent-Type: application/json\n\n{"name":"Ada"}'
    );
    expect(serialized.endsWith('\n')).toBe(false);
    expect(parse(serialized)[0]?.body).toBe('{"name":"Ada"}');
  });

  test('serializes form data fields including file references', () => {
    const serialized = serializeRequest({
      method: 'POST',
      url: 'https://api.example.com/upload',
      formData: [
        { name: 'title', value: 'Quarterly Report', isFile: false },
        { name: 'document', value: '', isFile: true, path: './reports/q4.pdf' },
        {
          name: 'thumbnail',
          value: '',
          isFile: true,
          path: './images/thumb.png',
          filename: 'thumb-final.png'
        }
      ]
    });

    expect(serialized).toBe(
      'POST https://api.example.com/upload\n\ntitle = Quarterly Report\ndocument = @./reports/q4.pdf\nthumbnail = @./images/thumb.png | thumb-final.png'
    );

    const parsed = parse(serialized);
    expect(parsed[0]?.formData).toEqual([
      { name: 'title', value: 'Quarterly Report', isFile: false },
      { name: 'document', value: '', isFile: true, path: './reports/q4.pdf', filename: undefined },
      {
        name: 'thumbnail',
        value: '',
        isFile: true,
        path: './images/thumb.png',
        filename: 'thumb-final.png'
      }
    ]);
  });

  test('serializes body file reference syntax', () => {
    const serialized = serializeRequest({
      method: 'POST',
      url: 'https://api.example.com/data',
      bodyFile: { path: './fixtures/payload.json' }
    });

    expect(serialized).toBe('POST https://api.example.com/data\n\n< ./fixtures/payload.json');
    expect(parse(serialized)[0]?.bodyFile).toEqual({ path: './fixtures/payload.json' });
  });

  test('serializes file variables before multi-request blocks with one blank line', () => {
    const document: SerializableDocument = {
      fileVariables: {
        host: 'api.example.com',
        token: 'abc123'
      },
      requests: [
        { name: 'users', method: 'GET', url: 'https://{{host}}/users' },
        { name: 'projects', method: 'GET', url: 'https://{{host}}/projects' }
      ]
    };

    const serialized = serializeDocument(document);
    expect(serialized.startsWith('@host = api.example.com\n@token = abc123\n\n')).toBe(true);

    const parsed = parseDocument(serialized);
    expect(parsed.fileVariables).toEqual({ host: 'api.example.com', token: 'abc123' });
    expect(parsed.requests).toHaveLength(2);
  });

  test('handles empty body, no headers, special chars, and directives with/without values', () => {
    const serialized = serializeRequest({
      method: 'GET',
      url: 'https://api.example.com/search?q=a%2Bb%26c',
      directives: [
        { name: 'sse', value: '' },
        { name: 'timeout', value: '5000' }
      ],
      headers: {
        'X-Special': "!#$%&'()*+,/:;=?@[]~"
      },
      body: ''
    });

    expect(serialized).toBe(
      "# @sse\n# @timeout 5000\nGET https://api.example.com/search?q=a%2Bb%26c\nX-Special: !#$%&'()*+,/:;=?@[]~"
    );
    expect(parse(serialized)[0]?.meta).toEqual({ sse: '', timeout: '5000' });

    const noHeadersSerialized = serializeRequest({
      method: 'POST',
      url: 'https://api.example.com/no-headers',
      body: 'plain text'
    });
    expect(noHeadersSerialized).toBe('POST https://api.example.com/no-headers\n\nplain text');
  });

  test('serializes and reparses websocket directives with protocol options', () => {
    const serialized = serializeRequest({
      method: 'GET',
      url: 'wss://api.example.com/socket',
      directives: [
        { name: 'ws', value: '' },
        { name: 'ws-subprotocols', value: 'chat, json' },
        { name: 'ws-connect-timeout', value: '30000' }
      ]
    });

    const reparsed = parse(serialized);
    expect(reparsed).toHaveLength(1);
    expect(reparsed[0]?.protocol).toBe('ws');
    expect(reparsed[0]?.protocolOptions?.type).toBe('ws');
    if (reparsed[0]?.protocolOptions?.type === 'ws') {
      expect(reparsed[0].protocolOptions.subprotocols).toEqual(['chat', 'json']);
      expect(reparsed[0].protocolOptions.connectTimeoutMs).toBe(30000);
    }
  });
});
